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


def test_data_link_on_bucket_has_direct_url(test_client, bucket):
    r = test_client.post("/api/proxied-path?fsp_name=idr&path=a.ome.zarr")
    assert r.status_code == 200
    assert r.json()["url"] == "https://idr.s3.amazonaws.com/zarr/v0.4/a.ome.zarr"
    listed = test_client.get("/api/proxied-path").json()["paths"]
    assert listed[0]["url"] == "https://idr.s3.amazonaws.com/zarr/v0.4/a.ome.zarr"
    key = r.json()["sharing_key"]
    assert test_client.get(f"/api/proxied-path/{key}").json()["url"] == "https://idr.s3.amazonaws.com/zarr/v0.4/a.ome.zarr"


def test_data_link_on_custom_endpoint_bucket_is_path_style(test_client, bucket):
    _add_bucket("minio", endpoint_url="https://s3.example.org")
    r = test_client.post("/api/proxied-path?fsp_name=minio&path=a.ome.zarr")
    assert r.status_code == 200
    assert r.json()["url"] == "https://s3.example.org/idr/zarr/v0.4/a.ome.zarr"


def test_data_link_on_bucket_root(test_client, bucket):
    assert test_client.post("/api/proxied-path?fsp_name=idr&path=.").json()["url"] == "https://idr.s3.amazonaws.com/zarr/v0.4"


def test_data_link_on_missing_bucket_path_is_400(test_client, bucket):
    r = test_client.post("/api/proxied-path?fsp_name=idr&path=nope")
    assert r.status_code == 400 and r.json()["error"]


def test_update_data_link_on_bucket_validates_and_keeps_direct_url(test_client, bucket):
    key = test_client.post("/api/proxied-path?fsp_name=idr&path=a.ome.zarr").json()["sharing_key"]
    assert test_client.put(f"/api/proxied-path/{key}?path=nope").status_code == 400
    r = test_client.put(f"/api/proxied-path/{key}?path=readme.txt")
    assert r.status_code == 200 and r.json()["url"] == "https://idr.s3.amazonaws.com/zarr/v0.4/readme.txt"


def test_local_data_link_url_unchanged(test_client, bucket, temp_dir):
    os.makedirs(os.path.join(temp_dir, "test_proxied_path"), exist_ok=True)
    r = test_client.post("/api/proxied-path?fsp_name=tempdir&path=test_proxied_path")
    assert r.json()["url"].startswith("http://localhost/files/")


def test_files_proxy_refuses_cloud_link(test_client, bucket):
    key = test_client.post("/api/proxied-path?fsp_name=idr&path=a.ome.zarr").json()["sharing_key"]
    r = test_client.get(f"/files/{key}/a.ome.zarr/.zattrs")
    assert r.status_code == 400 and b"InvalidArgument" in r.content


def test_delete_cloud_link_skips_dependent_views_409(test_client, bucket):
    # The local-link side (409 without confirm) is test_endpoints.py::test_delete_data_link_blocks_then_confirms_marks_broken
    key = test_client.post("/api/proxied-path?fsp_name=idr&path=a.ome.zarr").json()["sharing_key"]
    view = test_client.post("/api/neuroglancer/views", json={
        "name": "v", "ng_state": {}, "layers": [{"layer_index": 0, "sharing_key": key}]}).json()
    assert test_client.delete(f"/api/proxied-path/{key}").status_code == 200
    assert test_client.get(f"/api/proxied-path/{key}").status_code == 404
    assert test_client.get(f"/api/neuroglancer/views/{view['short_key']}").json()["layers"][0]["broken"] is False
