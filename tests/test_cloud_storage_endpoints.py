"""Cloud Storage: bucket-backed routes, exercised over HTTP against an in-memory fake S3 client."""

import os

import pytest
from fastapi.testclient import TestClient

import fileglancer.settings
from fileglancer import database as db
from fileglancer.database import create_cloud_bucket
from test_endpoints import temp_dir, test_app, test_client, TEST_USERNAME  # noqa: F401  (pytest picks the fixtures up)
from test_api_token_auth import token_app, _client_with_token  # noqa: F401
from test_s3store import OBJECTS
from fake_s3 import FakeS3Client


@pytest.fixture
def test_client(test_app):  # noqa: F811  shadows the one imported from test_endpoints
    from fileglancer.server import get_current_user, get_optional_user
    test_app.dependency_overrides[get_current_user] = lambda: TEST_USERNAME
    test_app.dependency_overrides[get_optional_user] = lambda: TEST_USERNAME
    yield TestClient(test_app)
    test_app.dependency_overrides.clear()


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


def test_disabled_feature_omits_buckets_from_share_list(test_client, bucket):
    fileglancer.settings.get_settings().cloud_storage.enabled = False
    assert [p["name"] for p in test_client.get("/api/file-share-paths").json()["paths"]] == ["tempdir"]


def test_bucket_on_endpoint_no_longer_allowed_is_403(test_client, fake_s3):
    assert test_client.post("/api/cloud-storage/buckets", json={"bucket": "idr", "label": "far", "endpoint_url": "https://s3.example.org"}).status_code == 201
    fileglancer.settings.get_settings().cloud_storage.allowed_endpoints = []
    r = test_client.get("/api/files/far")
    assert r.status_code == 403 and r.json() == {"error": "Endpoint no longer allowed on this server"}
    assert test_client.get("/api/files/tempdir").status_code == 200


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
    layer = test_client.get(f"/api/neuroglancer/views/{view['short_key']}").json()["layers"][0]
    assert layer["data_link_id"] is None and layer["broken"] is False


CREATE = {"protocol": "s3", "bucket": "idr", "prefix": "/zarr/v0.4/", "label": "IDR zarr"}


def test_config_default(test_client):
    assert test_client.get("/api/cloud-storage/config").json() == {"enabled": True, "endpoint_url_allowed": True, "allowed_endpoints": None}


def test_config_aws_only(test_client):
    fileglancer.settings.get_settings().cloud_storage.allowed_endpoints = []
    assert test_client.get("/api/cloud-storage/config").json()["endpoint_url_allowed"] is False


def test_create_bucket_returns_fsp_and_lists_it(test_client, fake_s3):
    r = test_client.post("/api/cloud-storage/buckets", json=CREATE)
    assert r.status_code == 201
    assert r.json() == {"name": "IDR_zarr", "zone": "S3", "group": "cloud", "storage": "IDR zarr",
                        "mount_path": "s3://idr/zarr/v0.4", "mac_path": None, "windows_path": None, "linux_path": None, "protocol": "s3"}
    assert [b["name"] for b in test_client.get("/api/cloud-storage/buckets").json()["buckets"]] == ["IDR_zarr"]
    names = [p["name"] for p in test_client.get("/api/file-share-paths").json()["paths"]]
    assert names == ["tempdir", "IDR_zarr"]
    assert any(c[0] == "list_objects_v2" and c[1]["MaxKeys"] == 1 for c in fake_s3.calls)  # probe


def test_create_bucket_default_label(test_client, fake_s3):
    r = test_client.post("/api/cloud-storage/buckets", json={"bucket": "idr", "prefix": "zarr"})
    assert r.json()["storage"] == "idr/zarr" and r.json()["name"] == "idr_zarr"


def test_create_bucket_custom_endpoint_stores_origin(test_client, fake_s3):
    r = test_client.post("/api/cloud-storage/buckets", json={"bucket": "idr", "endpoint_url": "https://S3.Example.org/ignored?x=1"})
    assert r.status_code == 201
    settings = fileglancer.settings.get_settings()
    with db.get_db_session(settings.db_url) as session:
        assert db.get_cloud_bucket(session, TEST_USERNAME, r.json()["name"]).endpoint_url == "https://s3.example.org"


@pytest.mark.parametrize("body,message", [
    ({"bucket": "Bad_Name"}, "Invalid bucket name"),
    ({"bucket": "idr\n"}, "Invalid bucket name"),
    ({"bucket": "idr", "prefix": "a/../b"}, "Prefix cannot contain"),
    ({"bucket": "idr", "label": "***"}, "Display name must contain"),
    ({"bucket": "idr", "endpoint_url": "http://s3.example.org"}, "must be an https"),
    ({"bucket": "idr", "endpoint_url": "https://10.0.0.5"}, "not an IP address"),
])
def test_create_bucket_validation_400(test_client, fake_s3, body, message):
    r = test_client.post("/api/cloud-storage/buckets", json=body)
    assert r.status_code == 400 and message in r.json()["error"]


def test_create_bucket_private_host_400(test_client, fake_s3, monkeypatch):
    monkeypatch.setattr("fileglancer.s3store._resolve_host", lambda h: ["93.184.216.34", "192.168.1.9"])
    r = test_client.post("/api/cloud-storage/buckets", json={"bucket": "idr", "endpoint_url": "https://s3.example.org"})
    assert r.status_code == 400 and "not a public host" in r.json()["error"]


def test_create_bucket_allowlist_400(test_client, fake_s3):
    fileglancer.settings.get_settings().cloud_storage.allowed_endpoints = ["https://s3.example.org"]
    r = test_client.post("/api/cloud-storage/buckets", json={"bucket": "idr", "endpoint_url": "https://other.example.org"})
    assert r.status_code == 400 and "ask the administrator" in r.json()["error"]
    assert test_client.post("/api/cloud-storage/buckets", json={"bucket": "idr", "endpoint_url": "https://s3.example.org"}).status_code == 201


@pytest.mark.parametrize("fail,message", [("NoSuchBucket", "Bucket not found"), ("AccessDenied", "not public"), ("timeout", "Could not reach"), ("parse", "does not speak the S3 API")])
def test_create_bucket_probe_failures_400(test_client, fake_s3, fail, message):
    fake_s3.fail = fail
    r = test_client.post("/api/cloud-storage/buckets", json={"bucket": "idr"})
    assert r.status_code == 400 and message in r.json()["error"]


def test_create_bucket_name_collisions_409(test_client, fake_s3):
    assert test_client.post("/api/cloud-storage/buckets", json={"bucket": "idr", "label": "tempdir"}).status_code == 409
    assert test_client.post("/api/cloud-storage/buckets", json=CREATE).status_code == 201
    assert test_client.post("/api/cloud-storage/buckets", json=CREATE).status_code == 409


def test_delete_bucket_cascades_links(test_client, bucket):
    test_client.post("/api/proxied-path?fsp_name=idr&path=a.ome.zarr")
    r = test_client.delete("/api/cloud-storage/buckets/idr")
    assert r.status_code == 200 and r.json() == {"name": "idr", "removed_links": 1}
    assert test_client.get("/api/proxied-path").json().get("paths", []) == []
    assert test_client.get("/api/files/idr").status_code == 404
    assert test_client.delete("/api/cloud-storage/buckets/idr").status_code == 404


def test_disabled_feature_404s_management(test_client, fake_s3):
    fileglancer.settings.get_settings().cloud_storage.enabled = False
    assert test_client.get("/api/cloud-storage/buckets").status_code == 404
    assert test_client.post("/api/cloud-storage/buckets", json=CREATE).status_code == 404
    assert test_client.get("/api/cloud-storage/config").json()["enabled"] is False


def test_file_share_paths_anonymous_is_site_list(token_app, fake_s3):
    app, db_session = token_app
    create_cloud_bucket(db_session, "alice", "idr", "s3", "idr", "idr", "", None)
    assert [p["name"] for p in TestClient(app).get("/api/file-share-paths").json()["paths"]] == ["tempdir"]


def test_file_share_paths_with_files_read_token_includes_buckets(token_app, fake_s3):
    app, db_session = token_app
    create_cloud_bucket(db_session, "alice", "idr", "s3", "idr", "idr", "", None)
    client, _ = _client_with_token(token_app, ["files:read"])
    assert [p["name"] for p in client.get("/api/file-share-paths").json()["paths"]] == ["tempdir", "idr"]


def test_file_share_paths_with_wrong_scope_token_falls_back_to_site_list(token_app, fake_s3):
    app, db_session = token_app
    create_cloud_bucket(db_session, "alice", "idr", "s3", "idr", "idr", "", None)
    client, _ = _client_with_token(token_app, ["links:read"])
    r = client.get("/api/file-share-paths")
    assert r.status_code == 200 and [p["name"] for p in r.json()["paths"]] == ["tempdir"]


def test_bucket_management_token_scopes(token_app, fake_s3):
    read, _ = _client_with_token(token_app, ["files:read"])
    assert read.get("/api/cloud-storage/buckets").status_code == 200
    assert read.post("/api/cloud-storage/buckets", json={"bucket": "idr"}).status_code == 403
    write, _ = _client_with_token(token_app, ["files:write"])
    assert write.post("/api/cloud-storage/buckets", json={"bucket": "idr"}).status_code == 201
