"""Virtual OME-Zarr for image files: path splitting, and the app end to end
against an embedded supervisor running a real zarrbridge."""

import importlib.util
import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from fileglancer import zarrproxy
from fileglancer.database import Base, FileSharePathDB, create_engine, dispose_engine, sessionmaker

TEST_USERNAME = "testuser"

needs_zarrbridge = pytest.mark.skipif(
    importlib.util.find_spec("zarrbridge") is None, reason="zarrbridge not installed")


@pytest.mark.parametrize("subpath, expected", [
    ("a/b.tif", None),
    ("a/b.tif/zarr.json", ("a/b.tif", "zarr.json")),
    ("a/B.TIFF/0/c/0/0", ("a/B.TIFF", "0/c/0/0")),
    ("x.nii.gz/0/c/0", ("x.nii.gz", "0/c/0")),
    ("tomo.mrc/_status", ("tomo.mrc", "_status")),
    ("/abs/dir/a.czi/0/zarr.json", ("abs/dir/a.czi", "0/zarr.json")),
    ("a.zarr/0/c/0", None),
    ("plain/dir/file.txt", None),
    ("", None),
])
def test_split_virtual_path(subpath, expected):
    assert zarrproxy.split_virtual_path(subpath) == expected


def test_entries_for_container_group_lists_child_images():
    info = {"name": "p.czi", "path": "d/p.czi", "absolute_path": "/m/d/p.czi", "is_dir": False}
    images = [{"path": "0"}, {"path": "1"}, {"path": "A/1/0"}]
    names = [e["name"] for e in zarrproxy._entries(info, "", {"attributes": {}}, images, 10)]
    assert names == ["zarr.json", "0", "1", "A"]
    nested = zarrproxy._entries(info, "A", {"attributes": {}}, images, 10)
    assert [e["name"] for e in nested] == ["zarr.json", "1"]
    assert nested[1]["path"] == "d/p.czi/A/1" and nested[1]["is_dir"] is True


@pytest.fixture
def zarr_app():
    # Short tmp dir: the supervisor's unix socket path must fit in sun_path.
    temp_dir = tempfile.mkdtemp(prefix="fgzb")
    import numpy as np
    import tifffile
    os.makedirs(os.path.join(temp_dir, "data"))
    tifffile.imwrite(os.path.join(temp_dir, "data", "tiny.tif"),
                     np.arange(64 * 64, dtype=np.uint16).reshape(64, 64))
    with open(os.path.join(temp_dir, "data", "notes.tif"), "w") as f:
        f.write("not a tiff at all")
    # An image outside the share, plus a symlink to it from inside: neither may be served.
    outside = tempfile.mkdtemp(prefix="fgzbout")
    tifffile.imwrite(os.path.join(outside, "secret.tif"), np.zeros((8, 8), dtype=np.uint8))
    os.symlink(os.path.join(outside, "secret.tif"), os.path.join(temp_dir, "data", "escape.tif"))

    db_url = f"sqlite:///{os.path.join(temp_dir, 'test.db')}"
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add(FileSharePathDB(name="share", zone="z", group="g", storage="local",
                                mount_path=temp_dir, mac_path="smb://x", windows_path="\\\\x",
                                linux_path="/x"))
    session.commit()
    session.close()

    from fileglancer.settings import Settings
    from fileglancer.server import create_app, get_current_user
    import fileglancer.settings
    import fileglancer.database
    settings = Settings(db_url=db_url, file_share_mounts=[], cli_mode=True,
                        supervisor_mode="embedded",
                        supervisor_socket=os.path.join(temp_dir, "sup.sock"))
    original = fileglancer.settings.get_settings
    fileglancer.settings.get_settings = lambda: settings
    fileglancer.database.get_settings = lambda: settings
    app = create_app(settings)
    app.dependency_overrides[get_current_user] = lambda: TEST_USERNAME
    try:
        with TestClient(app) as client:  # runs lifespan: starts the embedded supervisor
            client.outside = outside
            yield client
    finally:
        engine.dispose()
        dispose_engine(db_url)
        fileglancer.settings.get_settings = original
        fileglancer.database.get_settings = original
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)


@needs_zarrbridge
class TestVirtualZarr:

    def test_listing_of_image_file_has_zarr_entries(self, zarr_app):
        r = zarr_app.get("/api/files/share", params={"subpath": "data/tiny.tif"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["info"]["is_dir"] is False
        names = {f["name"]: f for f in body["files"]}
        assert "zarr.json" in names and names["zarr.json"]["path"] == "data/tiny.tif/zarr.json"
        assert names["0"]["is_dir"] is True

    def test_listing_inside_image_file(self, zarr_app):
        r = zarr_app.get("/api/files/share", params={"subpath": "data/tiny.tif/0"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["info"]["is_dir"] is True and body["info"]["path"] == "data/tiny.tif/0"
        assert [f["name"] for f in body["files"]] == ["zarr.json"]
        r = zarr_app.get("/api/files/share", params={"subpath": "data/tiny.tif/zarr.json"})
        assert r.status_code == 200, r.text
        assert r.json()["info"]["is_dir"] is False and r.json()["info"]["size"] > 0
        assert "files" not in r.json()
        r = zarr_app.get("/api/files/share", params={"subpath": "data/tiny.tif/nope"})
        assert r.status_code == 404

    def test_head_content_inside_image_file(self, zarr_app):
        r = zarr_app.head("/api/content/share", params={"subpath": "data/tiny.tif/zarr.json"})
        assert r.status_code == 200, r.text
        assert r.headers["X-Is-Binary"] == "false" and int(r.headers["Content-Length"]) > 0
        r = zarr_app.head("/api/content/share", params={"subpath": "data/tiny.tif/0/c/0/0"})
        assert r.status_code == 200 and r.headers["X-Is-Binary"] == "true"

    def test_data_link_inside_virtual_zarr(self, zarr_app):
        r = zarr_app.post("/api/proxied-path", params={"fsp_name": "share", "path": "data/tiny.tif/0"})
        assert r.status_code == 200, r.text
        key = r.json()["sharing_key"]
        r = zarr_app.get(f"/files/{key}/0/zarr.json")
        assert r.status_code == 200, r.text
        assert r.json()["node_type"] == "array"
        assert zarr_app.head(f"/files/{key}/0/c/0/0").status_code == 200
        r = zarr_app.post("/api/proxied-path", params={"fsp_name": "share", "path": "data/notes.tif/0"})
        assert r.status_code == 200, r.text  # validation is syntactic; serving decides
        r = zarr_app.post("/api/proxied-path", params={"fsp_name": "share", "path": "data/notes.txt/x"})
        assert r.status_code == 400, r.text

    def test_virtual_zarr_is_confined_to_share_and_link(self, zarr_app):
        secret = os.path.join(zarr_app.outside, "secret.tif")
        # Absolute and traversing subpaths stay inside the share.
        for sub in (f"{secret}/zarr.json", f"data/{secret}/zarr.json",
                    f"../{os.path.basename(zarr_app.outside)}/secret.tif/zarr.json"):
            r = zarr_app.get("/api/content/share", params={"subpath": sub})
            assert r.status_code == 404, (sub, r.status_code, r.text)
            assert zarr_app.head("/api/content/share", params={"subpath": sub}).status_code == 404
            assert zarr_app.get("/api/files/share", params={"subpath": sub}).status_code in (400, 404)
        # A symlink pointing out of the share is a plain file, never a virtual Zarr.
        r = zarr_app.get("/api/content/share", params={"subpath": "data/escape.tif/zarr.json"})
        assert r.status_code == 404, r.text
        r = zarr_app.get("/api/files/share", params={"subpath": "data/escape.tif"})
        assert r.status_code == 404 or "files" not in r.json()
        # A data link is confined to its own path: not the share, not the link owner's other files.
        r = zarr_app.post("/api/proxied-path", params={"fsp_name": "share", "path": "data/tiny.tif/0"})
        key = r.json()["sharing_key"]
        assert zarr_app.get(f"/files/{key}/0/zarr.json").status_code == 200
        for path in (f"0/{secret}/zarr.json", f"0//{secret}/zarr.json", "0//data/tiny.tif/zarr.json",
                     "0/data/escape.tif/zarr.json"):
            r = zarr_app.get(f"/files/{key}/{path}")
            assert r.status_code == 404, (path, r.status_code, r.text)
            assert zarr_app.head(f"/files/{key}/{path}").status_code == 404
        # A link on a directory: the reported bypass (absolute subpath) and the symlink.
        r = zarr_app.post("/api/proxied-path", params={"fsp_name": "share", "path": "data"})
        key = r.json()["sharing_key"]
        assert zarr_app.get(f"/files/{key}/data/tiny.tif/zarr.json").status_code == 200
        for path in (f"data/{secret}/zarr.json", f"data//{secret}/zarr.json", "data/escape.tif/zarr.json",
                     f"data/../{os.path.basename(zarr_app.outside)}/secret.tif/zarr.json"):
            r = zarr_app.get(f"/files/{key}/{path}")
            assert r.status_code == 404, (path, r.status_code, r.text)

    def test_unservable_file_lists_as_plain_file(self, zarr_app):
        r = zarr_app.get("/api/files/share", params={"subpath": "data/notes.tif"})
        assert r.status_code == 200
        assert "files" not in r.json()

    def test_content_proxies_metadata_and_chunks(self, zarr_app):
        r = zarr_app.get("/api/content/share/data/tiny.tif/zarr.json")
        assert r.status_code == 200, r.text
        assert r.json()["attributes"]["ome"]["multiscales"][0]["datasets"][0]["path"] == "0"
        r = zarr_app.get("/api/content/share", params={"subpath": "data/tiny.tif/0/zarr.json"})
        assert r.status_code == 200 and r.json()["node_type"] == "array"
        r = zarr_app.get("/api/content/share/data/tiny.tif/0/c/0/0")
        assert r.status_code == 200 and r.headers["x-zarrbridge-source"] == "native"
        assert len(r.content) > 0
        etag = r.headers["etag"]
        r = zarr_app.get("/api/content/share/data/tiny.tif/0/c/0/0", headers={"If-None-Match": etag})
        assert r.status_code == 304
        status = zarr_app.get("/api/content/share/data/tiny.tif/_status").json()
        assert status["classification"] == "servable"
        # The file itself is still the raw file.
        r = zarr_app.get("/api/content/share/data/tiny.tif")
        assert r.status_code == 200 and r.content[:2] in (b"II", b"MM")

    def test_data_link_serves_virtual_zarr_and_raw_file(self, zarr_app):
        r = zarr_app.post("/api/proxied-path", params={"fsp_name": "share", "path": "data/tiny.tif"})
        assert r.status_code == 200, r.text
        key = r.json()["sharing_key"]
        r = zarr_app.get(f"/files/{key}/tiny.tif/zarr.json")
        assert r.status_code == 200, r.text
        assert r.json()["node_type"] == "group"
        r = zarr_app.head(f"/files/{key}/tiny.tif/0/c/0/0")
        assert r.status_code == 200
        r = zarr_app.get(f"/files/{key}/tiny.tif/0/c/0/0")
        assert r.status_code == 200 and len(r.content) > 0
        r = zarr_app.get(f"/files/{key}/tiny.tif/nope/zarr.json")
        assert r.status_code == 404
        r = zarr_app.get(f"/files/{key}/tiny.tif")
        assert r.status_code == 200 and r.content[:2] in (b"II", b"MM")
