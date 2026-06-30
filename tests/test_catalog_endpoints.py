"""Tests for /api/catalog endpoints backed by the app_listings table."""

import os
import shutil
import tempfile
from datetime import datetime, UTC
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from fileglancer.settings import Settings
from fileglancer.server import create_app, get_current_user
from fileglancer.database import (
    Base,
    AppListingDB,
    UserAppDB,
    create_engine,
    dispose_engine,
    get_db_session,
    list_app_listings,
    get_app_listings_by_owner,
    list_user_apps,
)
from fileglancer.model import (
    AppEntryPoint,
    AppManifest,
    ShareAppRequest,
    UpdateAppListingRequest,
    resolve_catalog_listing_name,
)


OWNER = "alice"
ADOPTER = "bob"


def _make_manifest(name="Demo App", description="Demo"):
    return AppManifest(
        name=name,
        description=description,
        runnables=[AppEntryPoint(id="run", name="Run", command="echo hi")],
    )


def test_share_app_request_trims_name():
    request = ShareAppRequest(
        url="https://github.com/owner/repo",
        manifest_path="",
        name="  Catalog Name  ",
    )
    assert request.name == "Catalog Name"


def test_share_app_request_rejects_blank_name():
    with pytest.raises(ValidationError, match="Catalog listing name"):
        ShareAppRequest(
            url="https://github.com/owner/repo",
            manifest_path="",
            name="   ",
        )


def test_update_listing_request_trims_name():
    request = UpdateAppListingRequest(name="  Catalog Name  ")
    assert request.name == "Catalog Name"


def test_update_listing_request_rejects_blank_name():
    with pytest.raises(ValidationError, match="Catalog listing name"):
        UpdateAppListingRequest(name="   ")


def test_resolve_catalog_listing_name_rejects_blank_fallback():
    with pytest.raises(ValueError, match="Catalog listing name"):
        resolve_catalog_listing_name(None, "   ")


@pytest.fixture
def temp_dir():
    d = tempfile.mkdtemp()
    yield d
    shutil.rmtree(d)


@pytest.fixture
def test_app(temp_dir):
    db_path = os.path.join(temp_dir, "test.db")
    db_url = f"sqlite:///{db_path}"
    engine = create_engine(db_url)
    Base.metadata.create_all(engine)

    settings = Settings(db_url=db_url, file_share_mounts=[], cli_mode=True)

    import fileglancer.settings
    import fileglancer.database
    import fileglancer.apps.manifest
    import fileglancer.apps.jobs
    import fileglancer.apps.jobfiles
    original_get_settings = fileglancer.settings.get_settings
    fileglancer.settings.get_settings = lambda: settings
    fileglancer.database.get_settings = lambda: settings
    fileglancer.apps.manifest.get_settings = lambda: settings
    fileglancer.apps.jobs.get_settings = lambda: settings
    fileglancer.apps.jobfiles.get_settings = lambda: settings
    fileglancer.database._migrations_run = True

    app = create_app(settings)
    yield app, db_url

    engine.dispose()
    dispose_engine(db_url)
    fileglancer.settings.get_settings = original_get_settings
    fileglancer.database.get_settings = original_get_settings
    fileglancer.apps.manifest.get_settings = original_get_settings
    fileglancer.apps.jobs.get_settings = original_get_settings
    fileglancer.apps.jobfiles.get_settings = original_get_settings
    fileglancer.database._migrations_run = False


@pytest.fixture
def client_factory(test_app):
    """Returns a function that builds a TestClient impersonating a username."""
    app, _ = test_app

    def _build(username):
        app.dependency_overrides[get_current_user] = lambda: username
        return TestClient(app)

    yield _build
    app.dependency_overrides.clear()


@pytest.fixture
def db_session(test_app):
    _, db_url = test_app
    session = get_db_session(db_url)
    yield session
    session.close()


def _seed_user_app(db_session, *, username, url="https://github.com/owner/repo",
                   manifest_path="", name="Demo App",
                   description="Demo", branch="main", manifest=None):
    row = UserAppDB(
        username=username,
        url=url,
        manifest_path=manifest_path,
        name=name,
        description=description,
        branch=branch,
        manifest=manifest,
        added_at=datetime.now(UTC),
    )
    db_session.add(row)
    db_session.commit()
    return row


def _seed_listing(db_session, *, owner_username=OWNER,
                  url="https://github.com/owner/repo", manifest_path="",
                  name="Demo App", description="Demo", branch="main"):
    listing = AppListingDB(
        owner_username=owner_username,
        url=url,
        manifest_path=manifest_path,
        branch=branch,
        name=name,
        description=description,
        published_at=datetime.now(UTC),
    )
    db_session.add(listing)
    db_session.commit()
    return listing


def test_list_catalog_empty(client_factory):
    client = client_factory(OWNER)
    response = client.get("/api/catalog")
    assert response.status_code == 200
    assert response.json() == []


def test_share_app_requires_owning_the_app(client_factory):
    client = client_factory(OWNER)
    response = client.post(
        "/api/catalog",
        json={"url": "https://github.com/owner/repo", "manifest_path": ""},
    )
    assert response.status_code == 404


def test_share_app_creates_listing(client_factory, db_session):
    _seed_user_app(
        db_session,
        username=OWNER,
        manifest=_make_manifest().model_dump(mode="json"),
    )
    client = client_factory(OWNER)

    response = client.post(
        "/api/catalog",
        json={
            "url": "https://github.com/owner/repo",
            "manifest_path": "",
            "name": "Friendlier Name",
            "description": "Catalog blurb",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["owner_username"] == OWNER
    assert body["name"] == "Friendlier Name"
    assert body["description"] == "Catalog blurb"
    assert body["branch"] == "main"

    listings = list_app_listings(db_session)
    assert len(listings) == 1
    assert listings[0].owner_username == OWNER


def test_share_app_defaults_name_and_description_from_user_app(
    client_factory, db_session
):
    _seed_user_app(
        db_session,
        username=OWNER,
        name="App From User",
        description="Original description",
        manifest=_make_manifest().model_dump(mode="json"),
    )
    client = client_factory(OWNER)
    response = client.post(
        "/api/catalog",
        json={"url": "https://github.com/owner/repo", "manifest_path": ""},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "App From User"
    assert body["description"] == "Original description"


def test_share_app_rejects_duplicate(client_factory, db_session):
    _seed_user_app(
        db_session,
        username=OWNER,
        manifest=_make_manifest().model_dump(mode="json"),
    )
    client = client_factory(OWNER)
    first = client.post(
        "/api/catalog",
        json={"url": "https://github.com/owner/repo", "manifest_path": ""},
    )
    assert first.status_code == 200

    second = client.post(
        "/api/catalog",
        json={"url": "https://github.com/owner/repo", "manifest_path": ""},
    )
    assert second.status_code == 409


def test_get_apps_includes_listing_id_for_owner(client_factory, db_session):
    _seed_user_app(
        db_session,
        username=OWNER,
        manifest=_make_manifest().model_dump(mode="json"),
    )
    listing = _seed_listing(db_session, owner_username=OWNER)

    client = client_factory(OWNER)
    response = client.get("/api/apps")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["listing_id"] == listing.id


def test_get_apps_no_listing_id_for_non_owner(client_factory, db_session):
    """Two users both own the same (url, manifest_path) app; the listing is
    owned by alice; bob shouldn't see listing_id on his own user_app."""
    _seed_user_app(
        db_session,
        username=ADOPTER,
        manifest=_make_manifest().model_dump(mode="json"),
    )
    _seed_listing(db_session, owner_username=OWNER)

    client = client_factory(ADOPTER)
    response = client.get("/api/apps")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0].get("listing_id") is None


def test_update_listing(client_factory, db_session):
    listing = _seed_listing(db_session, owner_username=OWNER, name="Old name")
    client = client_factory(OWNER)
    response = client.patch(
        f"/api/catalog/{listing.id}",
        json={"name": "New name", "description": "New desc"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "New name"
    assert body["description"] == "New desc"


def test_update_listing_rejects_non_owner(client_factory, db_session):
    listing = _seed_listing(db_session, owner_username=OWNER)
    client = client_factory(ADOPTER)
    response = client.patch(
        f"/api/catalog/{listing.id}",
        json={"name": "Hijack"},
    )
    assert response.status_code == 404


def test_delete_listing(client_factory, db_session):
    listing = _seed_listing(db_session, owner_username=OWNER)
    client = client_factory(OWNER)
    response = client.delete(f"/api/catalog/{listing.id}")
    assert response.status_code == 200
    assert list_app_listings(db_session) == []


def test_delete_listing_rejects_non_owner(client_factory, db_session):
    listing = _seed_listing(db_session, owner_username=OWNER)
    client = client_factory(ADOPTER)
    response = client.delete(f"/api/catalog/{listing.id}")
    assert response.status_code == 404
    assert len(list_app_listings(db_session)) == 1


def test_add_from_listing_creates_independent_user_app(
    client_factory, db_session
):
    """Adopter cloning the listing gets their own user_app row that preserves
    the listing's custom name/description, while the manifest itself is freshly
    fetched from disk."""
    listing = _seed_listing(
        db_session, owner_username=OWNER,
        name="Custom Name", description="Custom description",
    )
    fresh = _make_manifest(name="Fetched", description="From disk")

    client = client_factory(ADOPTER)
    with patch(
        "fileglancer.apps.fetch_app_manifest",
        new=AsyncMock(return_value=fresh),
    ) as mock_fetch:
        response = client.post(f"/api/catalog/{listing.id}/add")

    assert response.status_code == 200
    assert mock_fetch.await_args.args == (
        "https://github.com/owner/repo/tree/main",
        "",
    )
    body = response.json()
    assert body["name"] == "Custom Name"
    assert body["description"] == "Custom description"
    assert body["branch"] == "main"
    assert body["manifest"]["name"] == "Fetched"

    rows = list_user_apps(db_session, ADOPTER)
    assert len(rows) == 1
    assert rows[0].url == "https://github.com/owner/repo"
    assert rows[0].name == "Custom Name"
    assert rows[0].description == "Custom description"


def test_add_from_listing_rejects_when_already_added(
    client_factory, db_session
):
    listing = _seed_listing(db_session, owner_username=OWNER)
    _seed_user_app(
        db_session,
        username=ADOPTER,
        manifest=_make_manifest().model_dump(mode="json"),
    )
    client = client_factory(ADOPTER)
    response = client.post(f"/api/catalog/{listing.id}/add")
    assert response.status_code == 409


def test_add_from_listing_404_when_listing_missing(client_factory):
    client = client_factory(ADOPTER)
    response = client.post("/api/catalog/9999/add")
    assert response.status_code == 404


def test_unshare_does_not_remove_adopters_app(client_factory, db_session):
    """When the owner unshares, adopters who already cloned keep their app."""
    listing = _seed_listing(db_session, owner_username=OWNER)
    _seed_user_app(
        db_session,
        username=ADOPTER,
        manifest=_make_manifest().model_dump(mode="json"),
    )

    owner_client = client_factory(OWNER)
    response = owner_client.delete(f"/api/catalog/{listing.id}")
    assert response.status_code == 200

    assert list_app_listings(db_session) == []
    assert len(list_user_apps(db_session, ADOPTER)) == 1


def test_list_catalog_visible_to_other_users(client_factory, db_session):
    _seed_listing(db_session, owner_username=OWNER, name="Shared by Alice")
    client = client_factory(ADOPTER)
    response = client.get("/api/catalog")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["owner_username"] == OWNER
    assert body[0]["name"] == "Shared by Alice"


def test_listings_owner_helper(db_session):
    """Sanity check: get_app_listings_by_owner returns only owner's listings."""
    _seed_listing(db_session, owner_username=OWNER,
                  url="https://github.com/owner/r1")
    _seed_listing(db_session, owner_username=ADOPTER,
                  url="https://github.com/owner/r2")
    alice_listings = get_app_listings_by_owner(db_session, OWNER)
    assert len(alice_listings) == 1
    assert alice_listings[0].url == "https://github.com/owner/r1"
