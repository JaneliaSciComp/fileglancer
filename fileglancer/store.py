"""
The contract a file share backend satisfies, and the local backend.

Two backends exist: S3Store (a public bucket, served from the server process) and
WorkerStore (a site share, served by the per-user worker subprocess). Routes get
one of them from server._store_for and never branch on which. Both return the
dict shapes the routes already consume; open_range raises StoreError instead,
so one handler can turn a 416 or a 404 into a response.
"""

from typing import AsyncIterable, Awaitable, Callable, Iterable, Optional, Protocol, Tuple, Union, runtime_checkable

from .filestore import Filestore
from .utils import format_timestamp, make_etag, parse_range_header

Body = Union[Iterable[bytes], AsyncIterable[bytes]]
RangeResponse = Tuple[int, dict, Body]


class StoreError(Exception):
    """A backend failure mapped to an HTTP status and a user-facing message."""

    def __init__(self, status_code: int, message: str, headers: Optional[dict] = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.headers = headers


class StoreRedirect(Exception):
    """The path belongs to another share: the route should 307 there."""

    def __init__(self, fsp_name: str, subpath: str):
        super().__init__(f"{fsp_name}/{subpath}")
        self.fsp_name = fsp_name
        self.subpath = subpath


@runtime_checkable
class ReadStore(Protocol):
    async def list_dir(self, path: str) -> dict: ...
    async def list_dir_paged(self, path: str, limit: int, cursor: Optional[str], max_count: int) -> dict: ...
    async def head_file(self, path: str) -> dict: ...
    async def open_range(self, path: str, range_header: Optional[str]) -> RangeResponse: ...


@runtime_checkable
class WriteStore(ReadStore, Protocol):
    async def create_dir(self, path: str) -> dict: ...
    async def create_file(self, path: str) -> dict: ...
    async def update_file(self, path: str, new_path: Optional[str], new_permissions: Optional[str]) -> dict: ...
    async def delete(self, path: str) -> dict: ...
    async def write_file(self, path: str, if_match: Optional[str], if_unmodified_since: Optional[float]) -> dict: ...


class WorkerStore:
    """A site share, every call dispatched to the user's worker."""

    def __init__(self, worker_exec: Callable[..., Awaitable[dict]], username: str, fsp_name: str):
        self._exec = worker_exec
        self.username = username
        self.fsp_name = fsp_name

    async def _call(self, action: str, **kwargs) -> dict:
        result = await self._exec(self.username, action, fsp_name=self.fsp_name, **kwargs)
        if result.get("redirect"):
            raise StoreRedirect(result["fsp_name"], result.get("subpath") or "")
        return result

    async def list_dir(self, path: str) -> dict:
        return await self._call("list_dir", subpath=path)

    async def list_dir_paged(self, path: str, limit: int, cursor: Optional[str], max_count: int) -> dict:
        return await self._call("list_dir_paged", subpath=path, limit=limit, cursor=cursor, max_count=max_count)

    async def head_file(self, path: str) -> dict:
        return await self._call("head_file", subpath=path)

    async def open_range(self, path: str, range_header: Optional[str]) -> RangeResponse:
        """Open a file as the user and stream all of it (200) or the requested range (206)."""
        result = await self._call("open_file", subpath=path)
        if "error" in result:
            raise StoreError(result.get("status_code", 500), result["error"])
        file_handle = result["_file_handle"]
        size = result["file_size"]
        last_modified = result["last_modified"]
        headers = {
            'Accept-Ranges': 'bytes',
            'Last-Modified': format_timestamp(last_modified),
            'ETag': make_etag(last_modified, size),
        }
        if not range_header:
            headers['Content-Length'] = str(size)
            return 200, headers, Filestore._stream_contents(file_handle)
        byte_range = parse_range_header(range_header, size)
        if byte_range is None:
            file_handle.close()
            raise StoreError(416, "Requested range not satisfiable", headers={'Content-Range': f'bytes */{size}'})
        start, end = byte_range
        length = end - start + 1
        headers['Content-Length'] = str(length)
        headers['Content-Range'] = f'bytes {start}-{end}/{size}'
        return 206, headers, Filestore._stream_range(start, end, length, file_handle)

    async def create_dir(self, path: str) -> dict:
        return await self._call("create_dir", subpath=path)

    async def create_file(self, path: str) -> dict:
        return await self._call("create_file", subpath=path)

    async def update_file(self, path: str, new_path: Optional[str], new_permissions: Optional[str]) -> dict:
        return await self._call("update_file", subpath=path, new_path=new_path, new_permissions=new_permissions)

    async def delete(self, path: str) -> dict:
        return await self._call("delete", subpath=path)

    async def write_file(self, path: str, if_match: Optional[str], if_unmodified_since: Optional[float]) -> dict:
        return await self._call("write_file", subpath=path, if_match=if_match, if_unmodified_since=if_unmodified_since)
