"""In-memory fake of the aiobotocore S3 client calls that S3Store makes."""

import hashlib
import re
from datetime import datetime, timezone
from typing import Optional

import botocore.exceptions
import botocore.parsers

_FAIL_STATUS = {"NoSuchBucket": 404, "AccessDenied": 403}


def _client_error(code: str, status: int, operation: str) -> botocore.exceptions.ClientError:
    return botocore.exceptions.ClientError(
        {"Error": {"Code": code, "Message": code}, "ResponseMetadata": {"HTTPStatusCode": status}},
        operation,
    )


class FakeBody:
    """Stand-in for aiobotocore's StreamingBody."""

    def __init__(self, data: bytes):
        self.data = data
        self.closed = False

    async def read(self) -> bytes:
        return self.data

    async def iter_chunks(self, chunk_size: int = 1024):
        for i in range(0, len(self.data), chunk_size):
            yield self.data[i:i + chunk_size]

    def close(self):
        self.closed = True


class FakeS3Client:
    """In-memory stand-in for an aiobotocore S3 client. objects: {key: bytes}."""

    def __init__(self, objects: dict[str, bytes], fail: Optional[str] = None, last_modified=None):
        self.objects = objects
        self.fail = fail
        self.last_modified = last_modified or datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
        self.calls = []

    def _record(self, method: str, kwargs: dict):
        self.calls.append((method, kwargs))
        if self.fail in _FAIL_STATUS:
            raise _client_error(self.fail, _FAIL_STATUS[self.fail], method)
        if self.fail == "timeout":
            raise botocore.exceptions.ConnectTimeoutError(endpoint_url="x")
        if self.fail == "parse":
            raise botocore.parsers.ResponseParserError("not xml")

    def _etag(self, key: str) -> str:
        return '"' + hashlib.md5(self.objects[key]).hexdigest() + '"'

    async def list_objects_v2(self, Bucket, Prefix="", Delimiter=None, MaxKeys=1000, ContinuationToken=None) -> dict:
        self._record("list_objects_v2", dict(Bucket=Bucket, Prefix=Prefix, Delimiter=Delimiter,
                                             MaxKeys=MaxKeys, ContinuationToken=ContinuationToken))
        entries = {}  # key -> ("prefix" | "object")
        for key in self.objects:
            if not key.startswith(Prefix):
                continue
            rest = key[len(Prefix):]
            if Delimiter and Delimiter in rest:
                entries[Prefix + rest.split(Delimiter, 1)[0] + Delimiter] = "prefix"
            else:
                entries[key] = "object"
        ordered = sorted(entries.items())
        start = int(ContinuationToken or 0)
        page = ordered[start:start + MaxKeys]
        result = {"IsTruncated": start + MaxKeys < len(ordered), "KeyCount": len(page), "Prefix": Prefix}
        if result["IsTruncated"]:
            result["NextContinuationToken"] = str(start + MaxKeys)
        contents = [{"Key": k, "Size": len(self.objects[k]), "LastModified": self.last_modified, "ETag": self._etag(k)}
                    for k, kind in page if kind == "object"]
        prefixes = [{"Prefix": k} for k, kind in page if kind == "prefix"]
        # Real S3 omits the keys entirely when they would be empty
        if contents:
            result["Contents"] = contents
        if prefixes:
            result["CommonPrefixes"] = prefixes
        return result

    async def head_object(self, Bucket, Key) -> dict:
        self._record("head_object", dict(Bucket=Bucket, Key=Key))
        if Key not in self.objects:
            raise _client_error("404", 404, "HeadObject")
        return {"ContentLength": len(self.objects[Key]), "LastModified": self.last_modified, "ETag": self._etag(Key)}

    async def get_object(self, Bucket, Key, Range=None) -> dict:
        self._record("get_object", dict(Bucket=Bucket, Key=Key, Range=Range))
        if Key not in self.objects:
            raise _client_error("NoSuchKey", 404, "GetObject")
        data = self.objects[Key]
        headers = {}
        if Range:
            m = re.fullmatch(r"bytes=(\d+)-(\d*)", Range)
            start = int(m.group(1))
            if start >= len(data):
                raise _client_error("InvalidRange", 416, "GetObject")
            end = min(int(m.group(2)) if m.group(2) else len(data) - 1, len(data) - 1)
            headers["content-range"] = f"bytes {start}-{end}/{len(data)}"
            data = data[start:end + 1]
        return {
            "Body": FakeBody(data),
            "ContentLength": len(data),
            "LastModified": self.last_modified,
            "ETag": self._etag(Key),
            "ResponseMetadata": {"HTTPStatusCode": 206 if Range else 200, "HTTPHeaders": headers},
        }
