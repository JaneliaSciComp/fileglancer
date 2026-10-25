"""Conformance test: S3Store and WorkerStore satisfy the same ReadStore contract."""

import pytest

from fileglancer import s3store
from fileglancer.model import FileSharePath
from fileglancer.s3store import S3Store
from fileglancer.store import ReadStore, StoreError, WorkerStore, WriteStore
from fileglancer.user_worker import _ACTIONS, WorkerContext
from fake_s3 import FakeS3Client

CONTENT = b"hello world"
RANGE_HEADERS = {"Content-Length", "Accept-Ranges", "Last-Modified", "ETag"}


@pytest.fixture
def s3(monkeypatch):
    client = FakeS3Client({"pre/readme.txt": CONTENT, "pre/sub/a.txt": b"a"})

    async def get_client(endpoint_url):
        return client

    monkeypatch.setattr(s3store, "get_client", get_client)
    return S3Store("bucket", "pre", None)


@pytest.fixture
def worker(tmp_path):
    (tmp_path / "readme.txt").write_bytes(CONTENT)
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "a.txt").write_bytes(b"a")
    fsp = FileSharePath(zone="test", name=f"conf_{tmp_path.name}", mount_path=str(tmp_path))

    async def exec_in_process(username, action, **kwargs):
        request = {"action": action, "file_share_paths": [fsp.model_dump(mode="json")], **kwargs}
        result = _ACTIONS[action](request, WorkerContext(username=username))
        result.pop("_fd", None)
        result.pop("_fd_mode", None)
        return result

    return WorkerStore(exec_in_process, "test", fsp.name)


@pytest.fixture(params=["s3", "worker"])
def store(request):
    return request.getfixturevalue(request.param)


async def _read(body) -> bytes:
    if hasattr(body, "__aiter__"):
        return b"".join([chunk async for chunk in body])
    return b"".join(body)


def test_both_satisfy_read_store(store):
    assert isinstance(store, ReadStore)


def test_only_the_worker_store_is_writable(s3, worker):
    assert not isinstance(s3, WriteStore)
    assert isinstance(worker, WriteStore)


@pytest.mark.asyncio
async def test_list_dir_shape(store):
    r = await store.list_dir(".")
    assert set(r) == {"info", "files"} and r["info"]["is_dir"] is True
    assert sorted(f["name"] for f in r["files"]) == ["readme.txt", "sub"]


@pytest.mark.asyncio
async def test_list_dir_paged_shape(store):
    r = await store.list_dir_paged(".", 1, None, 1000)
    assert set(r) == {"info", "files", "has_more", "next_cursor", "total_count", "is_truncated", "max_count"}
    assert r["has_more"] is True and len(r["files"]) == 1 and r["max_count"] == 1000


@pytest.mark.asyncio
async def test_head_file_shape(store):
    r = await store.head_file("readme.txt")
    assert set(r) == {"info", "content_type", "is_binary"}
    assert r["content_type"] == "text/plain" and r["is_binary"] is False and r["info"]["size"] == len(CONTENT)


@pytest.mark.asyncio
async def test_missing_path_is_an_error_dict(store):
    r = await store.head_file("nope.txt")
    assert r["status_code"] == 404 and "error" in r


@pytest.mark.asyncio
async def test_open_range_without_range_is_200(store):
    status, headers, body = await store.open_range("readme.txt", None)
    assert status == 200 and set(headers) == RANGE_HEADERS
    assert headers["Content-Length"] == str(len(CONTENT)) and headers["Accept-Ranges"] == "bytes"
    assert await _read(body) == CONTENT


@pytest.mark.asyncio
async def test_open_range_partial_is_206(store):
    status, headers, body = await store.open_range("readme.txt", "bytes=0-3")
    assert status == 206 and set(headers) == RANGE_HEADERS | {"Content-Range"}
    assert headers["Content-Range"] == f"bytes 0-3/{len(CONTENT)}" and headers["Content-Length"] == "4"
    assert await _read(body) == b"hell"


@pytest.mark.asyncio
async def test_open_range_unsatisfiable_is_416(store):
    with pytest.raises(StoreError) as e:
        await store.open_range("readme.txt", "bytes=99999-")
    assert e.value.status_code == 416
    assert e.value.headers == {"Content-Range": f"bytes */{len(CONTENT)}"}


@pytest.mark.asyncio
async def test_open_range_missing_is_404(store):
    with pytest.raises(StoreError) as e:
        await store.open_range("nope.txt", None)
    assert e.value.status_code == 404
