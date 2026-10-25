"""
Read-only storage backed by a public S3 bucket, accessed anonymously.

S3Store returns the same result dicts as the per-user worker's file actions
(list_dir, list_dir_paged, head_file, validate_proxied_path), so routes can
branch once on the share's protocol. Runs in the server process: public
buckets need no user identity.
"""

import ipaddress
import re
import socket
from datetime import datetime
from typing import AsyncIterator, List, Optional, Tuple
from urllib.parse import quote, urlsplit

import aiohttp
import botocore
import botocore.exceptions
import botocore.parsers
from aiobotocore.config import AioConfig
from aiobotocore.session import get_session
from loguru import logger

from .database import CloudBucketDB
from .filestore import FileInfo
from .utils import format_timestamp, guess_content_type, is_likely_binary, make_etag

BUCKET_NAME_RE = re.compile(r'^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$')

# Bytes per chunk when streaming object bodies (aiobotocore defaults to 1 KiB)
STREAM_CHUNK_SIZE = 64 * 1024

# Bytes sampled to decide whether a file is binary, as Filestore.check_is_binary does
BINARY_SAMPLE_SIZE = 4096

# One client per distinct endpoint_url (None = AWS) for the life of the process
_clients: dict = {}

_UNREACHABLE = (
    botocore.exceptions.ConnectionError,
    botocore.exceptions.HTTPClientError,
    aiohttp.ClientError,
    TimeoutError,
)
_S3_EXCEPTIONS = (
    botocore.exceptions.ClientError,
    botocore.exceptions.BotoCoreError,
    botocore.parsers.ResponseParserError,
) + _UNREACHABLE


class S3Error(Exception):
    """An S3 failure mapped to an HTTP status and a user-facing message."""

    def __init__(self, status_code: int, message: str, headers: Optional[dict] = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.headers = headers


def client_kwargs(endpoint_url: Optional[str]) -> dict:
    """Keyword arguments for session.create_client('s3', ...): unsigned, short timeouts."""
    kwargs = {
        'region_name': 'us-east-1',
        'config': AioConfig(
            signature_version=botocore.UNSIGNED,
            connect_timeout=5,
            read_timeout=30,
            s3={'addressing_style': 'path'} if endpoint_url else {},
        ),
    }
    if endpoint_url:
        kwargs['endpoint_url'] = endpoint_url
    return kwargs


async def get_client(endpoint_url: Optional[str]):
    """Return the process-wide anonymous S3 client for an endpoint, creating it once."""
    if endpoint_url not in _clients:
        client = await get_session().create_client('s3', **client_kwargs(endpoint_url)).__aenter__()
        if endpoint_url in _clients:
            # Another request created it while we awaited; keep theirs
            await client.close()
        else:
            _clients[endpoint_url] = client
    return _clients[endpoint_url]


def _resolve_host(host: str) -> List[str]:
    """All A/AAAA addresses for a host name; empty if it does not resolve."""
    try:
        infos = socket.getaddrinfo(host, 443)
    except socket.gaierror:
        return []
    return sorted({info[4][0] for info in infos})


def validate_endpoint_url(endpoint_url: str, allowed: Optional[List[str]]) -> str:
    """
    Validate a user-supplied S3 endpoint and return its normalized origin
    (https://host[:port]). The host must resolve only to public addresses, so the
    server cannot be pointed at internal services. If allowed is a list, the
    origin must be in it. Raises ValueError with a user-facing message.
    """
    parts = urlsplit((endpoint_url or '').strip())
    try:
        port = parts.port
    except ValueError:
        raise ValueError("Endpoint must be an https:// URL")
    if parts.scheme.lower() != 'https' or not parts.hostname:
        raise ValueError("Endpoint must be an https:// URL")
    host = parts.hostname
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass  # a host name, as required
    else:
        raise ValueError("Endpoint must be a host name, not an IP address")
    origin = f"https://{host}" if port in (None, 443) else f"https://{host}:{port}"
    if allowed is not None and origin not in allowed:
        raise ValueError("Endpoint is not allowed on this server; ask the administrator to add it")
    # ponytail: resolved at add time only; pin addresses on the client if DNS rebinding ever matters
    addresses = _resolve_host(host)
    if not addresses or not all(ipaddress.ip_address(a).is_global for a in addresses):
        raise ValueError("Endpoint is not a public host")
    return origin


def normalize_prefix(prefix: Optional[str]) -> str:
    """Strip surrounding whitespace and slashes and collapse repeated '/'."""
    segments = [s for s in (prefix or '').strip().split('/') if s]
    if any(s in ('.', '..') for s in segments):
        raise ValueError("Prefix cannot contain '.' or '..' segments")
    return '/'.join(segments)


def _map_client_error(exc: Exception) -> S3Error:
    """Map an aiobotocore/botocore exception to an S3Error with an HTTP status."""
    if isinstance(exc, botocore.exceptions.ClientError):
        code = str(exc.response.get('Error', {}).get('Code', ''))
        status = exc.response.get('ResponseMetadata', {}).get('HTTPStatusCode')
        if code == 'NoSuchBucket':
            return S3Error(404, "Bucket not found")
        if code in ('NoSuchKey', '404') or status == 404:
            return S3Error(404, "File or directory not found")
        if code in ('AccessDenied', '403') or status == 403:
            return S3Error(403, "Permission denied")
        if code == 'InvalidRange':
            return S3Error(416, "Requested range not satisfiable")
        return S3Error(502, f"S3 error: {code}")
    if isinstance(exc, botocore.parsers.ResponseParserError):
        return S3Error(502, "Endpoint does not speak the S3 API")
    if isinstance(exc, _UNREACHABLE):
        return S3Error(502, "Could not reach the endpoint")
    return S3Error(502, f"S3 error: {type(exc).__name__}")


def _error(e: S3Error) -> dict:
    return {"error": e.message, "status_code": e.status_code}


async def _stream(body) -> AsyncIterator[bytes]:
    """Yield an object body in chunks, releasing the connection even if abandoned."""
    try:
        async for chunk in body.iter_chunks(STREAM_CHUNK_SIZE):
            yield chunk
    finally:
        body.close()


class S3Store:
    """A bucket (optionally narrowed to a key prefix) browsed as a read-only file share."""

    def __init__(self, bucket: str, prefix: str, endpoint_url: Optional[str]):
        self.bucket = bucket
        self.prefix = (prefix or '').strip('/')
        self.endpoint_url = endpoint_url

    @classmethod
    def for_bucket(cls, row: CloudBucketDB) -> "S3Store":
        return cls(row.bucket, row.prefix, row.endpoint_url)

    def key_for(self, path: str) -> str:
        """The object key for a path relative to the prefix ('' or '.' is the prefix itself)."""
        path = (path or '').strip('/')
        if path in ('', '.'):
            return self.prefix
        return f"{self.prefix}/{path}" if self.prefix else path

    def public_url(self, path: str) -> str:
        """Direct anonymous HTTPS URL for a path."""
        if self.endpoint_url:
            base = f"{self.endpoint_url}/{self.bucket}"
        else:
            base = f"https://{self.bucket}.s3.amazonaws.com"
        return f"{base}/{quote(self.key_for(path), safe='/')}"

    async def _call(self, operation: str, **kwargs) -> dict:
        client = await get_client(self.endpoint_url)
        try:
            return await getattr(client, operation)(Bucket=self.bucket, **kwargs)
        except _S3_EXCEPTIONS as e:
            logger.debug(f"S3 {operation} on {self.bucket} failed: {e!r}")
            raise _map_client_error(e) from e

    def _file_info(self, key: str, is_dir: bool, size: int = 0,
                   last_modified: Optional[datetime] = None) -> FileInfo:
        rel = key[len(self.prefix) + 1:] if self.prefix else key
        return FileInfo(
            name=key.rsplit('/', 1)[-1] or self.bucket,
            path=rel or '.',
            absolute_path=f"s3://{self.bucket}/{key}" if key else f"s3://{self.bucket}",
            size=0 if is_dir else size,
            is_dir=is_dir,
            permissions='dr-xr-xr-x' if is_dir else '-r--r--r--',
            last_modified=None if is_dir or last_modified is None else last_modified.timestamp(),
            hasRead=True,
            hasWrite=False,
            is_symlink=False,
        )

    @staticmethod
    def _dir_prefix(key: str) -> str:
        return f"{key}/" if key else ''

    async def get_file_info(self, path: str) -> FileInfo:
        """FileInfo for a path; a key that is both an object and a prefix is a directory."""
        key = self.key_for(path)
        if key == self.prefix:
            # Proves the bucket is listable; an empty prefix is still a valid root
            await self._call('list_objects_v2', Prefix=self._dir_prefix(key), MaxKeys=1)
            return self._file_info(key, is_dir=True)
        r = await self._call('list_objects_v2', Prefix=f"{key}/", MaxKeys=1)
        if r.get('Contents') or r.get('CommonPrefixes'):
            return self._file_info(key, is_dir=True)
        head = await self._call('head_object', Key=key)
        return self._file_info(key, is_dir=False, size=head['ContentLength'], last_modified=head['LastModified'])

    async def _list_page(self, path: str, limit: int, cursor: Optional[str]) -> Tuple[list, bool, Optional[str]]:
        """One ListObjectsV2 page as sorted FileInfo dicts, plus has_more and next_cursor."""
        kwargs = dict(Prefix=self._dir_prefix(self.key_for(path)), Delimiter='/', MaxKeys=limit)
        if cursor:
            kwargs['ContinuationToken'] = cursor
        r = await self._call('list_objects_v2', **kwargs)
        dirs = [self._file_info(p['Prefix'][:-1], is_dir=True) for p in r.get('CommonPrefixes', [])]
        dir_names = {d.name for d in dirs}
        # Keys ending in '/' are directory markers (including the listed prefix itself);
        # a file whose name is also a directory on this page loses to the directory
        files = [
            self._file_info(o['Key'], is_dir=False, size=o['Size'], last_modified=o['LastModified'])
            for o in r.get('Contents', [])
            if not o['Key'].endswith('/') and o['Key'].rsplit('/', 1)[-1] not in dir_names
        ]
        entries = sorted(dirs + files, key=lambda f: (not f.is_dir, f.name))
        return ([f.model_dump(mode="json") for f in entries],
                bool(r.get('IsTruncated')), r.get('NextContinuationToken'))

    async def list_dir(self, path: str) -> dict:
        """Info for path and, if a directory, its first 1000 entries."""
        try:
            info = await self.get_file_info(path)
            result = {"info": info.model_dump(mode="json")}
            if info.is_dir:
                result["files"], _, _ = await self._list_page(path, 1000, None)
            return result
        except S3Error as e:
            return _error(e)

    async def list_dir_paged(self, path: str, limit: int, cursor: Optional[str], max_count: int) -> dict:
        """Info for path and, if a directory, one page of entries. S3 cannot count, so total_count is None."""
        try:
            info = await self.get_file_info(path)
            result = {"info": info.model_dump(mode="json")}
            if info.is_dir:
                files, has_more, next_cursor = await self._list_page(path, limit, cursor)
                result.update(files=files, has_more=has_more, next_cursor=next_cursor,
                              total_count=None, is_truncated=False, max_count=max_count)
            return result
        except S3Error as e:
            return _error(e)

    async def head_file(self, path: str) -> dict:
        """Info, content type and a binary sniff of the first bytes."""
        try:
            info = await self.get_file_info(path)
            is_binary = False
            # S3 rejects any Range on an empty object, so skip the sniff there
            if not info.is_dir and info.size > 0:
                r = await self._call('get_object', Key=self.key_for(path),
                                     Range=f'bytes=0-{BINARY_SAMPLE_SIZE - 1}')
                is_binary = is_likely_binary(await r['Body'].read())
            return {
                "info": info.model_dump(mode="json"),
                "content_type": guess_content_type(info.name),
                "is_binary": is_binary,
            }
        except S3Error as e:
            return _error(e)

    async def open_range(self, path: str, range_header: Optional[str]) -> Tuple[int, dict, AsyncIterator[bytes]]:
        """
        GET an object, passing the client's Range header through.
        Returns (200 or 206, response headers, body chunks). Raises S3Error; a 416
        carries headers={'Content-Range': 'bytes */<size>'}.
        """
        key = self.key_for(path)
        kwargs = {'Key': key}
        if range_header:
            kwargs['Range'] = range_header
        try:
            r = await self._call('get_object', **kwargs)
        except S3Error as e:
            if e.status_code != 416:
                raise
            head = await self._call('head_object', Key=key)
            raise S3Error(416, e.message, headers={'Content-Range': f"bytes */{head['ContentLength']}"}) from e
        content_range = r.get('ResponseMetadata', {}).get('HTTPHeaders', {}).get('content-range')
        size = int(content_range.rsplit('/', 1)[1]) if content_range else r['ContentLength']
        last_modified = r['LastModified'].timestamp()
        headers = {
            'Content-Length': str(r['ContentLength']),
            'Accept-Ranges': 'bytes',
            'Last-Modified': format_timestamp(last_modified),
            'ETag': make_etag(last_modified, size),
        }
        if content_range:
            headers['Content-Range'] = content_range
        return (206 if content_range else 200), headers, _stream(r['Body'])

    async def validate_proxied_path(self, path: str) -> dict:
        """{'ok': True} if path exists and is readable, else a 400 error dict."""
        try:
            await self.get_file_info(path)
        except S3Error as e:
            return {"error": e.message, "status_code": 400}
        return {"ok": True}

    async def probe(self) -> None:
        """Check the bucket and prefix are anonymously listable. Raises S3Error(400, message)."""
        try:
            await self.get_file_info('.')
        except S3Error as e:
            message = {
                404: "Bucket not found",
                403: "Bucket is not public (authenticated buckets are not yet supported)",
            }.get(e.status_code, e.message)
            raise S3Error(400, message) from e
