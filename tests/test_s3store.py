"""Tests for the read-only S3 storage backend, run against an in-memory fake client."""

import botocore
import pytest
from aiobotocore.session import get_session
from aiohttp import web
from aiohttp.test_utils import TestServer

from fileglancer import s3store
from fileglancer.s3store import (
    S3Error,
    S3Store,
    client_kwargs,
    normalize_prefix,
    validate_endpoint_url,
)
from fake_s3 import FakeS3Client

OBJECTS = {
    "zarr/v0.4/a.ome.zarr/.zattrs": b"{}",
    "zarr/v0.4/a.ome.zarr/0/.zarray": b"{}",
    "zarr/v0.4/a.ome.zarr/0/0.0": b"\x00\x01binary",
    "zarr/v0.4/readme.txt": b"hello world",
    "zarr/v0.4/with space#1.txt": b"x",
    "zarr/v0.4/both": b"file",
    "zarr/v0.4/both/child.txt": b"child",
    "zarr/v0.4/emptydir/": b"",
}

store = S3Store("idr", "zarr/v0.4", None)


@pytest.fixture
def fake(monkeypatch):
    """Returns a function that installs a FakeS3Client as the module's client."""
    def install(objects=OBJECTS, fail=None):
        client = FakeS3Client(dict(objects), fail=fail)

        async def get_client(endpoint_url):
            return client

        monkeypatch.setattr(s3store, "get_client", get_client)
        return client
    return install


@pytest.fixture
def client(fake):
    return fake()


@pytest.mark.asyncio
async def test_list_dir_root_folds_markers_and_sorts_dirs_first(client):
    r = await store.list_dir(".")
    assert r["info"]["path"] == "." and r["info"]["is_dir"] is True
    assert [f["name"] for f in r["files"]] == ["a.ome.zarr", "both", "emptydir", "readme.txt", "with space#1.txt"]
    assert [f["is_dir"] for f in r["files"]][:3] == [True, True, True]
    assert r["files"][3]["path"] == "readme.txt" and r["files"][3]["absolute_path"] == "s3://idr/zarr/v0.4/readme.txt"
    assert r["files"][3]["permissions"] == "-r--r--r--" and r["files"][3]["hasWrite"] is False and r["files"][3]["size"] == 11


@pytest.mark.asyncio
async def test_list_dir_paged_passes_cursor_and_reports_no_total(client):
    r1 = await store.list_dir_paged("a.ome.zarr", limit=1, cursor=None, max_count=100000)
    assert r1["has_more"] is True and r1["total_count"] is None and r1["is_truncated"] is False and r1["max_count"] == 100000
    r2 = await store.list_dir_paged("a.ome.zarr", limit=1, cursor=r1["next_cursor"], max_count=100000)
    assert {f["name"] for f in r1["files"]} | {f["name"] for f in r2["files"]} == {"0", ".zattrs"}
    assert any(c[1].get("ContinuationToken") == r1["next_cursor"] for c in client.calls)


@pytest.mark.asyncio
async def test_get_file_info_prefers_directory_when_key_is_both(client):
    info = await store.get_file_info("both")
    assert info.is_dir is True


@pytest.mark.asyncio
async def test_get_file_info_file_and_missing(client):
    info = await store.get_file_info("readme.txt")
    assert info.is_dir is False and info.size == 11 and info.last_modified is not None
    with pytest.raises(S3Error) as e:
        await store.get_file_info("nope.txt")
    assert e.value.status_code == 404


@pytest.mark.asyncio
async def test_list_dir_maps_access_denied_and_no_such_bucket(fake):
    fake(fail="AccessDenied")
    assert await store.list_dir(".") == {"error": "Permission denied", "status_code": 403}
    fake(fail="NoSuchBucket")
    assert (await store.list_dir("."))["status_code"] == 404


@pytest.mark.asyncio
async def test_open_range_full_and_partial(client):
    status, headers, body = await store.open_range("readme.txt", None)
    assert status == 200 and headers["Content-Length"] == "11" and headers["Accept-Ranges"] == "bytes" and "ETag" in headers
    status, headers, body = await store.open_range("readme.txt", "bytes=0-4")
    assert status == 206 and headers["Content-Range"] == "bytes 0-4/11" and headers["Content-Length"] == "5"
    assert b"".join([c async for c in body]) == b"hello"


@pytest.mark.asyncio
async def test_open_range_unsatisfiable_is_416_with_size(client):
    with pytest.raises(S3Error) as e:
        await store.open_range("readme.txt", "bytes=100-200")
    assert e.value.status_code == 416 and e.value.headers == {"Content-Range": "bytes */11"}


@pytest.mark.asyncio
async def test_head_file_sniffs_binary(client):
    assert (await store.head_file("a.ome.zarr/0/0.0"))["is_binary"] is True
    r = await store.head_file("readme.txt")
    assert r["is_binary"] is False and r["content_type"] == "text/plain" and r["info"]["size"] == 11


@pytest.mark.asyncio
async def test_redirect_to_internal_host_is_not_followed(monkeypatch):
    """A real client against a local endpoint that redirects every object GET to an internal URL."""
    secret_hits = []

    async def redirect(request):
        raise web.HTTPFound("/internal/secret")

    async def secret(request):
        secret_hits.append(request.path)
        return web.Response(body=b"INTERNAL-SECRET")

    app = web.Application()
    app.router.add_get("/internal/secret", secret)
    app.router.add_get("/idr/{key:.*}", redirect)
    async with TestServer(app, host="127.0.0.1") as server:
        endpoint = str(server.make_url("")).rstrip("/")
        async with get_session().create_client("s3", **client_kwargs(endpoint)) as real_client:
            async def get_client(endpoint_url):
                return real_client
            monkeypatch.setattr(s3store, "get_client", get_client)
            with pytest.raises(S3Error) as e:
                await S3Store("idr", "", endpoint).open_range("key", None)
    assert e.value.status_code == 502 and "redirect" in e.value.message
    assert secret_hits == []


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["../other", "a.ome.zarr/../../x", "./readme.txt", "a/./b"])
async def test_dot_segments_in_paths_are_rejected(path, client):
    assert await store.list_dir(path) == {"error": "Path cannot contain '.' or '..' segments", "status_code": 400}
    with pytest.raises(S3Error) as e:
        await store.open_range(path, None)
    assert e.value.status_code == 400
    assert client.calls == []


@pytest.mark.asyncio
async def test_validate_proxied_path(client):
    assert await store.validate_proxied_path("a.ome.zarr") == {"ok": True}
    assert (await store.validate_proxied_path("nope"))["status_code"] == 400


def test_public_url_aws_and_custom_encode_segments():
    assert store.public_url("with space#1.txt") == "https://idr.s3.amazonaws.com/zarr/v0.4/with%20space%231.txt"
    assert store.public_url(".") == "https://idr.s3.amazonaws.com/zarr/v0.4"
    assert S3Store("idr", "", None).public_url("") == "https://idr.s3.amazonaws.com/"
    # Dotted names break virtual-hosted TLS, so they go path style
    assert S3Store("open.data", "", None).public_url("x y") == "https://s3.amazonaws.com/open.data/x%20y"
    assert S3Store("open.data", "", None).public_url("") == "https://s3.amazonaws.com/open.data/"
    custom = S3Store("idr", "zarr/v0.4", "https://s3.example.org")
    assert custom.public_url("a.ome.zarr") == "https://s3.example.org/idr/zarr/v0.4/a.ome.zarr"


def test_client_kwargs():
    aws = client_kwargs(None)
    assert "endpoint_url" not in aws and aws["region_name"] == "us-east-1"
    assert aws["config"].signature_version is botocore.UNSIGNED and aws["config"].connect_timeout == 5 and aws["config"].read_timeout == 30
    assert aws["config"].http_session_cls is s3store.NoRedirectAIOHTTPSession
    assert aws["config"].retries == {"max_attempts": 2}
    custom = client_kwargs("https://s3.example.org")
    assert custom["config"].http_session_cls is s3store.NoRedirectAIOHTTPSession
    assert custom["config"].retries == {"max_attempts": 2}
    assert custom["endpoint_url"] == "https://s3.example.org" and custom["config"].s3 == {"addressing_style": "path"}


@pytest.mark.asyncio
@pytest.mark.parametrize("fail,message", [
    ("NoSuchBucket", "Bucket not found"),
    ("AccessDenied", "Bucket is not public (authenticated buckets are not yet supported)"),
    ("timeout", "Could not reach the endpoint"),
    ("parse", "Endpoint does not speak the S3 API"),
])
async def test_probe_messages(fail, message, fake):
    fake(fail=fail)
    with pytest.raises(S3Error) as e:
        await store.probe()
    assert e.value.status_code == 400 and e.value.message == message


@pytest.mark.asyncio
async def test_probe_accepts_empty_readable_prefix(fake):
    fake(objects={})
    await store.probe()


@pytest.mark.parametrize("url,allowed,expected", [
    ("https://S3.Example.org/", None, "https://s3.example.org"),
    ("https://s3.example.org:9000/some/path?x=1", None, "https://s3.example.org:9000"),
    ("https://s3.example.org", ["https://s3.example.org"], "https://s3.example.org"),
])
def test_validate_endpoint_url_normalizes(url, allowed, expected, monkeypatch):
    monkeypatch.setattr(s3store, "_resolve_host", lambda h: ["93.184.216.34"])
    assert validate_endpoint_url(url, allowed) == expected


@pytest.mark.parametrize("url,allowed,addrs,message", [
    ("http://s3.example.org", None, ["93.184.216.34"], "must be an https"),
    ("https://10.0.0.5", None, [], "not an IP address"),
    ("https://s3.example.org", None, ["10.0.0.5"], "not a public host"),
    ("https://s3.example.org", None, ["93.184.216.34", "10.0.0.5"], "not a public host"),
    ("https://s3.example.org", None, ["169.254.169.254"], "not a public host"),
    ("https://s3.example.org", None, ["fd00::1"], "not a public host"),
    ("https://s3.example.org", None, [], "not a public host"),
    ("https://other.example.org", ["https://s3.example.org"], ["93.184.216.34"], "not allowed on this server"),
    ("https://s3.example.org", [], ["93.184.216.34"], "not allowed on this server"),
])
def test_validate_endpoint_url_rejects(url, allowed, addrs, message, monkeypatch):
    monkeypatch.setattr(s3store, "_resolve_host", lambda h: addrs)
    with pytest.raises(ValueError, match=message):
        validate_endpoint_url(url, allowed)


@pytest.mark.parametrize("raw,expected", [("/zarr/v0.4/", "zarr/v0.4"), ("  a//b ", "a/b"), ("", ""), (None, "")])
def test_normalize_prefix(raw, expected):
    assert normalize_prefix(raw) == expected


@pytest.mark.parametrize("raw", ["../x", "a/../b", "./a"])
def test_normalize_prefix_rejects_dot_segments(raw):
    with pytest.raises(ValueError, match="Prefix cannot contain"):
        normalize_prefix(raw)
