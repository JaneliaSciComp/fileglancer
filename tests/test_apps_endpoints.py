"""Tests for /api/apps endpoints backed by the user_apps table."""

import os
import shutil
import tempfile
from datetime import datetime, UTC, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from fileglancer.settings import Settings
from fileglancer.server import create_app, get_current_user
from fileglancer.database import (
    Base,
    UserAppDB,
    UserPreferenceDB,
    create_engine,
    sessionmaker,
    dispose_engine,
    get_db_session,
    create_job,
    get_job,
    update_job_status,
    list_user_apps,
    upsert_user_app,
    get_user_app,
)
from fileglancer.model import AppEntryPoint, AppManifest


TEST_USERNAME = "testuser"


def _make_manifest(name="Demo App", description="Demo"):
    return AppManifest(
        name=name,
        description=description,
        runnables=[AppEntryPoint(id="run", name="Run", command="echo hi")],
    )


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
    # Migrations are unneeded here since create_all built the schema.
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
def test_client(test_app):
    app, _ = test_app
    app.dependency_overrides[get_current_user] = lambda: TEST_USERNAME
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def db_session(test_app):
    _, db_url = test_app
    session = get_db_session(db_url)
    yield session
    session.close()


def _seed_app(db_session, *, url="https://github.com/owner/repo",
              manifest_path="", manifest=None, name="Demo App",
              description="Demo", branch="main",
              added_at=None, updated_at=None):
    row = UserAppDB(
        username=TEST_USERNAME,
        url=url,
        manifest_path=manifest_path,
        name=name,
        description=description,
        branch=branch,
        manifest=manifest,
        added_at=added_at or datetime.now(UTC),
        updated_at=updated_at,
    )
    db_session.add(row)
    db_session.commit()
    return row


def _seed_job(db_session, *, status="DONE"):
    job = create_job(
        session=db_session,
        username=TEST_USERNAME,
        app_url="https://github.com/owner/repo",
        app_name="Demo App",
        entry_point_id="run",
        entry_point_name="Run",
        parameters={},
    )
    if status != "PENDING":
        update_job_status(db_session, job.id, status)
    db_session.refresh(job)
    return job


def test_url_normalized_on_write_and_lookup(db_session):
    """Stored app URLs are canonicalized on write, and lookups by any cosmetic
    variant (.git, trailing slash, /tree/main) resolve to the same row."""
    row = upsert_user_app(
        db_session, TEST_USERNAME,
        url="https://github.com/owner/repo.git", manifest_path="",
        name="Demo",
    )
    assert row.url == "https://github.com/owner/repo"

    for variant in (
        "https://github.com/owner/repo",
        "https://github.com/owner/repo.git",
        "https://github.com/owner/repo/",
        "https://github.com/owner/repo/tree/main",
        "git@github.com:owner/repo.git",
    ):
        found = get_user_app(db_session, TEST_USERNAME, variant, "")
        assert found is not None and found.id == row.id, variant


def test_get_apps_empty(test_client):
    response = test_client.get("/api/apps")
    assert response.status_code == 200
    assert response.json() == []


def test_get_apps_uses_db_cache(test_client, db_session):
    manifest = _make_manifest()
    _seed_app(db_session, manifest=manifest.model_dump(mode="json"))

    with patch("fileglancer.apps.fetch_app_manifest",
               new=AsyncMock()) as mock_fetch, \
         patch("fileglancer.apps.get_app_branch",
               new=AsyncMock()) as mock_branch:
        response = test_client.get("/api/apps")

    assert response.status_code == 200
    assert mock_fetch.await_count == 0
    assert mock_branch.await_count == 0

    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "Demo App"
    assert body[0]["branch"] == "main"
    assert body[0]["manifest"]["name"] == "Demo App"


def test_get_apps_backfills_null_manifest(test_client, db_session):
    _seed_app(db_session, manifest=None, branch="dev", name="Stale Name")
    manifest = _make_manifest(name="Fresh Name", description="Fresh")

    # refresh_cached_manifest calls fetch_app_manifest directly inside
    # apps/manifest.py, so patch the manifest namespace, not the apps re-export.
    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(return_value=manifest)) as mock_fetch:
        response = test_client.get("/api/apps")

    assert response.status_code == 200
    assert mock_fetch.await_count == 1

    body = response.json()
    assert body[0]["name"] == "Fresh Name"
    # The backfill only fills the manifest; the requested revision is preserved.
    assert body[0]["branch"] == "dev"
    assert body[0]["manifest"]["name"] == "Fresh Name"

    # Row is persisted; subsequent reads hit the cache.
    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    assert rows[0].manifest is not None
    assert rows[0].manifest["name"] == "Fresh Name"
    assert rows[0].branch == "dev"
    # Backfill should NOT bump updated_at (invisible refresh).
    assert rows[0].updated_at is None


def test_get_apps_handles_schema_drift(test_client, db_session):
    # Manifest missing required field 'runnables' → ValidationError.
    _seed_app(db_session, manifest={"name": "Broken"}, branch=None)
    fresh = _make_manifest(name="Recovered")

    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)) as mock_fetch, \
         patch("fileglancer.apps.manifest.get_app_branch",
               new=AsyncMock(return_value="main")):
        response = test_client.get("/api/apps")

    assert response.status_code == 200
    assert mock_fetch.await_count == 1

    body = response.json()
    assert body[0]["name"] == "Recovered"
    assert body[0]["manifest"]["name"] == "Recovered"


def test_get_apps_backfill_handles_fetch_failure(test_client, db_session):
    _seed_app(db_session, manifest=None, branch=None, name="Cached Name")

    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(side_effect=RuntimeError("network down"))), \
         patch("fileglancer.apps.manifest.get_app_branch",
               new=AsyncMock(side_effect=RuntimeError("nope"))):
        response = test_client.get("/api/apps")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    # Falls back to stored values; manifest stays unpopulated.
    assert body[0]["name"] == "Cached Name"
    assert body[0]["manifest"] is None


def test_add_app_persists_manifest_and_branch(test_client, db_session):
    """A bare URL is unpinned: branch is "" and the resolved default (main) folds
    to the bare canonical URL."""
    manifest = _make_manifest(name="From Add")
    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=[("", manifest)])), \
         patch("fileglancer.apps.manifest._resolve_default_branch",
               new=AsyncMock(return_value="main")):
        response = test_client.post(
            "/api/apps",
            json={"url": "https://github.com/owner/repo"},
        )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["name"] == "From Add"
    assert body[0]["branch"] == ""
    assert body[0]["url"] == "https://github.com/owner/repo"
    assert body[0]["manifest"]["name"] == "From Add"

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    assert rows[0].manifest["name"] == "From Add"
    assert rows[0].branch == ""


def test_add_app_bakes_resolved_default_into_url(test_client, db_session):
    """A bare URL for a repo whose default is 'master' stores '/tree/master', so
    it dedups against an explicit '/tree/master' add. branch stays "" (unpinned)."""
    manifest = _make_manifest(name="Master Default")
    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=[("", manifest)])), \
         patch("fileglancer.apps.manifest._resolve_default_branch",
               new=AsyncMock(return_value="master")):
        response = test_client.post(
            "/api/apps",
            json={"url": "https://github.com/owner/repo"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body[0]["url"] == "https://github.com/owner/repo/tree/master"
    assert body[0]["branch"] == ""

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    assert rows[0].url == "https://github.com/owner/repo/tree/master"
    assert rows[0].branch == ""


def test_add_app_pinned_revision_kept(test_client, db_session):
    """An explicit '/tree/dev' URL is pinned: branch records 'dev'."""
    manifest = _make_manifest(name="Pinned")
    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=[("", manifest)])):
        response = test_client.post(
            "/api/apps",
            json={"url": "https://github.com/owner/repo/tree/dev"},
        )

    assert response.status_code == 200
    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    assert rows[0].url == "https://github.com/owner/repo/tree/dev"
    assert rows[0].branch == "dev"


def test_add_app_dedups_bare_against_resolved_default(test_client, db_session):
    """The dedup-hole fix: a bare URL for a master-default repo matches an already
    stored '/tree/master' row, so the add is a no-op (409)."""
    manifest = _make_manifest()
    _seed_app(db_session, url="https://github.com/owner/repo/tree/master",
              branch="", manifest=manifest.model_dump(mode="json"))

    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=[("", manifest)])), \
         patch("fileglancer.apps.manifest._resolve_default_branch",
               new=AsyncMock(return_value="master")):
        response = test_client.post(
            "/api/apps",
            json={"url": "https://github.com/owner/repo"},
        )

    assert response.status_code == 409
    assert len(list_user_apps(db_session, TEST_USERNAME)) == 1


def test_add_app_dedups(test_client, db_session):
    """Adding the same repo twice returns 409 and inserts no new rows."""
    manifest = _make_manifest()
    _seed_app(db_session, url="https://github.com/owner/repo", branch="",
              manifest=manifest.model_dump(mode="json"))

    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=[("", manifest)])), \
         patch("fileglancer.apps.manifest._resolve_default_branch",
               new=AsyncMock(return_value="main")):
        response = test_client.post(
            "/api/apps",
            json={"url": "https://github.com/owner/repo"},
        )

    assert response.status_code == 409
    assert len(list_user_apps(db_session, TEST_USERNAME)) == 1


def test_update_app_persists_manifest(test_client, db_session):
    older = datetime.now(UTC) - timedelta(days=1)
    _seed_app(db_session, manifest=None, name="Old", added_at=older)

    fresh = _make_manifest(name="New", description="New")

    with patch("fileglancer.apps.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)), \
         patch("fileglancer.apps.get_app_branch",
               new=AsyncMock(return_value="main")), \
         patch("fileglancer.apps._ensure_repo_cache",
               new=AsyncMock(return_value="/tmp/x")) as mock_ensure:
        response = test_client.post(
            "/api/apps/update",
            json={"url": "https://github.com/owner/repo", "manifest_path": ""},
        )

    assert response.status_code == 200
    assert mock_ensure.await_count == 1
    assert mock_ensure.await_args.kwargs == {
        "pull": True,
        "username": TEST_USERNAME,
    }
    assert mock_ensure.await_args.args == ("https://github.com/owner/repo",)
    body = response.json()
    assert body["name"] == "New"
    assert body["updated_at"] is not None

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    assert rows[0].name == "New"
    assert rows[0].manifest["name"] == "New"
    assert rows[0].updated_at is not None
    # added_at preserved across update.
    assert rows[0].added_at.replace(tzinfo=None) == older.replace(tzinfo=None)


def test_update_app_pulls_separate_code_repo(test_client, db_session):
    """Update refreshes a top-level repo_url code repo as well as the manifest repo."""
    _seed_app(db_session, manifest=None, name="Old")

    fresh = AppManifest(
        name="New",
        description="New",
        repo_url="https://github.com/tools/code",
        runnables=[AppEntryPoint(id="run", name="Run", command="echo hi")],
    )

    with patch("fileglancer.apps.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)), \
         patch("fileglancer.apps.get_app_branch",
               new=AsyncMock(return_value="main")), \
         patch("fileglancer.apps._ensure_repo_cache",
               new=AsyncMock(return_value="/tmp/x")) as mock_ensure:
        response = test_client.post(
            "/api/apps/update",
            json={"url": "https://github.com/owner/repo", "manifest_path": ""},
        )

    assert response.status_code == 200
    assert mock_ensure.await_count == 2
    first_call, second_call = mock_ensure.await_args_list
    assert first_call.args == ("https://github.com/owner/repo",)
    assert first_call.kwargs == {"pull": True, "username": TEST_USERNAME}
    assert second_call.args == ("https://github.com/tools/code",)
    assert second_call.kwargs == {"pull": True, "username": TEST_USERNAME}

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert rows[0].manifest["repo_url"] == "https://github.com/tools/code"


@pytest.mark.parametrize(
    "stored_url,stored_branch",
    [
        # Unpinned app pinned to master at add time.
        ("https://github.com/owner/repo/tree/master", ""),
        # Explicitly pinned app.
        ("https://github.com/owner/repo/tree/dev", "dev"),
    ],
)
def test_update_pulls_stored_revision_and_never_re_resolves(
    test_client, db_session, stored_url, stored_branch
):
    """The revision is fixed at add time: update re-pulls the stored URL as-is,
    never re-resolving the default branch or moving the app to a new URL."""
    _seed_app(db_session, url=stored_url, branch=stored_branch,
              manifest=None, name="Old")
    fresh = _make_manifest(name="New")

    with patch("fileglancer.apps.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)), \
         patch("fileglancer.apps.manifest._resolve_default_branch",
               new=AsyncMock(side_effect=AssertionError("must not re-resolve"))), \
         patch("fileglancer.apps._ensure_repo_cache",
               new=AsyncMock(return_value="/tmp/x")) as mock_ensure:
        response = test_client.post(
            "/api/apps/update",
            json={"url": stored_url, "manifest_path": ""},
        )

    assert response.status_code == 200
    assert mock_ensure.await_args_list[0].args == (stored_url,)
    body = response.json()
    assert body["url"] == stored_url
    assert body["branch"] == stored_branch
    assert body["manifest"]["name"] == "New"

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    assert rows[0].url == stored_url
    # The revision fixed at add time is preserved.
    assert rows[0].branch == stored_branch


def test_delete_app_removes_row(test_client, db_session):
    _seed_app(db_session, manifest=_make_manifest().model_dump(mode="json"))
    assert len(list_user_apps(db_session, TEST_USERNAME)) == 1

    response = test_client.delete(
        "/api/apps",
        params={"url": "https://github.com/owner/repo", "manifest_path": ""},
    )
    assert response.status_code == 200
    assert len(list_user_apps(db_session, TEST_USERNAME)) == 0

    # Second delete → 404
    response = test_client.delete(
        "/api/apps",
        params={"url": "https://github.com/owner/repo", "manifest_path": ""},
    )
    assert response.status_code == 404


@pytest.mark.parametrize("status", ["PENDING", "RUNNING"])
def test_delete_active_job_is_rejected(test_client, db_session, status):
    job = _seed_job(db_session, status=status)
    job_id = job.id

    response = test_client.delete(f"/api/jobs/{job_id}")

    assert response.status_code == 409
    assert "cancel or stop" in response.json()["error"]
    db_session.expire_all()
    assert get_job(db_session, job_id, TEST_USERNAME) is not None


def test_delete_finished_job_removes_row(test_client, db_session):
    job = _seed_job(db_session, status="DONE")
    job_id = job.id

    response = test_client.delete(f"/api/jobs/{job_id}")

    assert response.status_code == 200
    db_session.expire_all()
    assert get_job(db_session, job_id, TEST_USERNAME) is None


def test_fetch_manifest_uses_cache_for_installed_app(test_client, db_session):
    """POST /api/apps/manifest returns cached manifest without disk read."""
    cached = _make_manifest(name="Cached App")
    _seed_app(db_session, manifest=cached.model_dump(mode="json"))

    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock()) as mock_fetch:
        response = test_client.post("/api/apps/manifest", json={
            "url": "https://github.com/owner/repo",
            "manifest_path": "",
        })

    assert response.status_code == 200
    assert mock_fetch.await_count == 0
    assert response.json()["name"] == "Cached App"


def test_fetch_manifest_reads_disk_for_uninstalled(test_client, db_session):
    """Preview of an uninstalled URL reads disk and does not create a row."""
    fresh = _make_manifest(name="Preview Only")

    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)) as mock_fetch:
        response = test_client.post("/api/apps/manifest", json={
            "url": "https://github.com/new/repo",
            "manifest_path": "",
        })

    assert response.status_code == 200
    assert mock_fetch.await_count == 1
    assert response.json()["name"] == "Preview Only"
    # No row was created for the preview.
    assert list_user_apps(db_session, TEST_USERNAME) == []


def test_fetch_manifest_backfills_null_cache(test_client, db_session):
    """If row exists with NULL manifest, endpoint reads disk and writes back."""
    _seed_app(db_session, manifest=None, name="Stale", branch=None)
    fresh = _make_manifest(name="Backfilled")

    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)) as mock_fetch, \
         patch("fileglancer.apps.manifest.get_app_branch",
               new=AsyncMock(return_value="main")):
        response = test_client.post("/api/apps/manifest", json={
            "url": "https://github.com/owner/repo",
            "manifest_path": "",
        })

    assert response.status_code == 200
    assert mock_fetch.await_count == 1
    assert response.json()["name"] == "Backfilled"

    # Row was updated silently (updated_at stays NULL).
    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    assert rows[0].manifest["name"] == "Backfilled"
    assert rows[0].updated_at is None


@pytest.mark.asyncio
async def test_get_or_load_manifest_cache_hit(test_app, db_session):
    """Cache hit returns parsed manifest without any disk read."""
    from fileglancer.apps import get_or_load_manifest

    cached = _make_manifest(name="From Cache")
    _seed_app(db_session, manifest=cached.model_dump(mode="json"))

    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock()) as mock_fetch:
        manifest = await get_or_load_manifest(
            TEST_USERNAME, "https://github.com/owner/repo", "",
        )

    assert manifest.name == "From Cache"
    assert mock_fetch.await_count == 0


@pytest.mark.asyncio
async def test_get_or_load_manifest_preview_no_row(test_app, db_session):
    """Preview of uninstalled URL reads disk, no row created."""
    from fileglancer.apps import get_or_load_manifest

    fresh = _make_manifest(name="Preview")
    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)) as mock_fetch:
        manifest = await get_or_load_manifest(
            TEST_USERNAME, "https://github.com/x/y", "",
        )

    assert manifest.name == "Preview"
    assert mock_fetch.await_count == 1
    assert list_user_apps(db_session, TEST_USERNAME) == []


@pytest.mark.asyncio
async def test_refresh_cached_manifest_syncs_existing_row(test_app, db_session):
    """refresh_cached_manifest updates an existing row from disk."""
    from fileglancer.apps import refresh_cached_manifest

    _seed_app(db_session, manifest=None, name="Stale", branch="dev")
    fresh = _make_manifest(name="Synced")

    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)):
        manifest = await refresh_cached_manifest(
            TEST_USERNAME, "https://github.com/owner/repo", "",
        )

    assert manifest.name == "Synced"

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert rows[0].manifest["name"] == "Synced"
    # A cache refresh leaves the requested revision (branch) untouched.
    assert rows[0].branch == "dev"
    # Silent refresh by default — updated_at stays NULL.
    assert rows[0].updated_at is None


@pytest.mark.asyncio
async def test_refresh_cached_manifest_no_op_for_uninstalled(test_app, db_session):
    """refresh_cached_manifest doesn't create rows for uninstalled apps."""
    from fileglancer.apps import refresh_cached_manifest

    fresh = _make_manifest()
    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)):
        manifest = await refresh_cached_manifest(
            TEST_USERNAME, "https://github.com/new/repo", "",
        )

    assert manifest.name == "Demo App"
    assert list_user_apps(db_session, TEST_USERNAME) == []


@pytest.mark.asyncio
async def test_refresh_cached_manifest_bumps_updated_at(test_app, db_session):
    """bump_updated_at=True is the explicit-user-update path."""
    from fileglancer.apps import refresh_cached_manifest

    _seed_app(db_session, manifest=None, name="Old")
    fresh = _make_manifest(name="Updated")

    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)):
        await refresh_cached_manifest(
            TEST_USERNAME, "https://github.com/owner/repo", "",
            bump_updated_at=True,
        )

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert rows[0].updated_at is not None


def test_alembic_migration_moves_legacy_apps(temp_dir, monkeypatch):
    """The migration relocates user_preferences['apps'] into user_apps."""
    from alembic.config import Config
    from alembic import command

    db_path = os.path.join(temp_dir, "legacy.db")
    db_url = f"sqlite:///{db_path}"

    # env.py forces the DB URL from FILEGLANCER_MIGRATION_DB_URL or settings,
    # so set_main_option('sqlalchemy.url', ...) is not enough — use the env
    # var that env.py actually reads.
    monkeypatch.setenv("FILEGLANCER_MIGRATION_DB_URL", db_url)

    pkg_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    alembic_ini = os.path.join(pkg_dir, "alembic.ini")
    if not os.path.exists(alembic_ini):
        alembic_ini = os.path.join(pkg_dir, "fileglancer", "alembic.ini")
    assert os.path.exists(alembic_ini), f"alembic.ini not found near {pkg_dir}"

    cfg = Config(alembic_ini)
    cfg.set_main_option("sqlalchemy.url", db_url)

    # 1) Upgrade to the revision just before ours.
    command.upgrade(cfg, "20b763c28c4f")

    # 2) Seed legacy apps preference.
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    s = Session()
    s.add(UserPreferenceDB(
        username=TEST_USERNAME,
        key="apps",
        value={"apps": [
            {
                "url": "https://github.com/owner/repo",
                "manifest_path": "",
                "name": "Legacy",
                "description": "From prefs",
                "added_at": "2025-01-01T00:00:00+00:00",
            },
            {
                "url": "https://github.com/owner/repo",
                "manifest_path": "sub",
                "name": "Legacy Sub",
                "added_at": "2025-01-02T00:00:00",
            },
        ]},
    ))
    s.commit()
    s.close()

    # 3) Run our migration.
    command.upgrade(cfg, "c4e8a7d92b15")

    # 4) Verify rows moved and preference is gone.
    s = Session()
    apps = s.query(UserAppDB).filter_by(username=TEST_USERNAME).order_by(UserAppDB.manifest_path).all()
    assert len(apps) == 2
    assert apps[0].name == "Legacy"
    assert apps[0].manifest_path == ""
    assert apps[0].manifest is None  # backfilled lazily
    assert apps[0].branch is None
    assert apps[1].manifest_path == "sub"

    prefs = s.query(UserPreferenceDB).filter_by(username=TEST_USERNAME, key="apps").all()
    assert prefs == []
    s.close()
    engine.dispose()
