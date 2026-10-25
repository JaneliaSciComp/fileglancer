"""Cloud Storage: bucket-backed routes, exercised over HTTP against an in-memory fake S3 client."""

import os

import pytest

import fileglancer.settings
from fileglancer import database as db
from test_endpoints import temp_dir, test_app, test_client, TEST_USERNAME  # noqa: F401  (pytest picks the fixtures up)
from test_s3store import OBJECTS
from fake_s3 import FakeS3Client


def _add_bucket(name, bucket="idr", prefix="zarr/v0.4", endpoint_url=None):
    settings = fileglancer.settings.get_settings()
    with db.get_db_session(settings.db_url) as session:
        db.create_cloud_bucket(session, TEST_USERNAME, name, "s3", name, bucket, prefix, endpoint_url)


@pytest.fixture
def fake_s3(monkeypatch):
    """Patch the client factory; tests mutate fake.objects / fake.fail before requests."""
    fake = FakeS3Client(dict(OBJECTS))

    async def _get_client(endpoint_url):
        return fake
    monkeypatch.setattr("fileglancer.s3store.get_client", _get_client)
    monkeypatch.setattr("fileglancer.s3store._resolve_host", lambda host: ["93.184.216.34"])
    return fake


@pytest.fixture
def bucket(test_app, fake_s3):
    """A bucket named 'idr' (bucket idr, prefix zarr/v0.4, AWS) owned by TEST_USERNAME."""
    _add_bucket("idr")


def test_list_bucket_root(test_client, bucket):
    r = test_client.get("/api/files/idr")
    assert r.status_code == 200
    body = r.json()
    assert body["info"]["path"] == "." and body["info"]["hasWrite"] is False
    assert "readme.txt" in [f["name"] for f in body["files"]]


def test_list_bucket_paged_has_null_total(test_client, bucket):
    body = test_client.get("/api/files/idr?subpath=a.ome.zarr&limit=1").json()
    assert body["total_count"] is None and body["has_more"] is True and body["next_cursor"]


def test_bucket_file_info_and_missing(test_client, bucket):
    assert test_client.get("/api/files/idr?subpath=readme.txt").json()["info"]["is_dir"] is False
    r = test_client.get("/api/files/idr?subpath=missing")
    assert r.status_code == 404 and r.json()["error"]


def test_bucket_access_denied_is_403(test_client, bucket, fake_s3):
    fake_s3.fail = "AccessDenied"
    assert test_client.get("/api/files/idr").status_code == 403


def test_site_share_shadows_same_named_bucket(test_client, temp_dir, bucket, fake_s3):
    _add_bucket("tempdir")
    with open(os.path.join(temp_dir, "local_only.txt"), "w") as f:
        f.write("local")
    r = test_client.get("/api/files/tempdir")
    assert r.status_code == 200
    assert "local_only.txt" in [f["name"] for f in r.json()["files"]]
    assert fake_s3.calls == []


def test_bucket_content_get_and_range(test_client, bucket):
    r = test_client.get("/api/content/idr?subpath=readme.txt")
    assert r.status_code == 200 and r.content == b"hello world" and r.headers["accept-ranges"] == "bytes"
    r = test_client.get("/api/content/idr?subpath=readme.txt", headers={"Range": "bytes=0-4"})
    assert r.status_code == 206 and r.content == b"hello" and r.headers["content-range"] == "bytes 0-4/11"
    r = test_client.get("/api/content/idr?subpath=readme.txt", headers={"Range": "bytes=100-200"})
    assert r.status_code == 416 and r.headers["content-range"] == "bytes */11"


def test_bucket_content_head(test_client, bucket):
    r = test_client.head("/api/content/idr?subpath=a.ome.zarr/0/0.0")
    assert r.status_code == 200 and r.headers["x-is-binary"] == "true" and r.headers["content-length"] == "8"


@pytest.mark.parametrize("method,url,kwargs", [
    ("post", "/api/files/idr?subpath=newdir", {"json": {"type": "directory"}}),
    ("patch", "/api/files/idr?subpath=readme.txt", {"json": {"path": "x.txt"}}),
    ("delete", "/api/files/idr?subpath=readme.txt", {}),
    ("put", "/api/content/idr?subpath=readme.txt", {"content": b"x"}),
])
def test_writes_on_bucket_are_405(test_client, bucket, method, url, kwargs):
    r = getattr(test_client, method)(url, **kwargs)
    assert r.status_code == 405 and r.json() == {"error": "Not supported on cloud storage"}


def test_disabled_feature_hides_buckets(test_client, bucket):
    fileglancer.settings.get_settings().cloud_storage.enabled = False
    assert test_client.get("/api/files/idr").status_code == 404
