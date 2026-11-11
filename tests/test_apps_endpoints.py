"""Tests for /api/apps endpoints backed by the user_apps table."""

import os
import shlex
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
    FileSharePathDB,
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
TEST_SHA = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
TEST_SHA_2 = "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1"


def _make_manifest(name="Demo App", description="Demo"):
    return AppManifest(
        name=name,
        description=description,
        runnables=[AppEntryPoint(id="run", name="Run", command="echo hi")],
    )


def _patch_snapshot(sha=TEST_SHA):
    """Patch ensure_repo_snapshot as the server sees it, so add/update tests
    never touch git or the worker."""
    return patch(
        "fileglancer.apps.ensure_repo_snapshot",
        new=AsyncMock(return_value=(f"/tmp/snapshots/{sha}", sha)),
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
              description="Demo", branch="main", commit_sha=None,
              added_at=None, updated_at=None):
    row = UserAppDB(
        username=TEST_USERNAME,
        url=url,
        manifest_path=manifest_path,
        name=name,
        description=description,
        branch=branch,
        commit_sha=commit_sha,
        manifest=manifest,
        added_at=added_at or datetime.now(UTC),
        updated_at=updated_at,
    )
    db_session.add(row)
    db_session.commit()
    return row


def _seed_job(db_session, *, status="DONE", entry_point_type="job",
              work_dir=None, cluster_job_id=None, script_path=None,
              started_at=None, work_dir_fsp_name=None, work_dir_subpath=None):
    job = create_job(
        session=db_session,
        username=TEST_USERNAME,
        app_url="https://github.com/owner/repo",
        app_name="Demo App",
        entry_point_id="run",
        entry_point_name="Run",
        entry_point_type=entry_point_type,
        parameters={},
    )
    if work_dir:
        job.work_dir = work_dir
        db_session.commit()
    update_job_status(
        db_session, job.id, status,
        cluster_job_id=cluster_job_id,
        script_path=script_path,
        started_at=started_at,
        work_dir_fsp_name=work_dir_fsp_name,
        work_dir_subpath=work_dir_subpath,
    )
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
    _seed_app(db_session, url="https://github.com/owner/repo/tree/dev",
              manifest=None, branch="dev", name="Custom Name")
    manifest = _make_manifest(name="Fresh Name", description="Fresh")

    # refresh_cached_manifest calls fetch_app_manifest directly inside
    # apps/manifest.py, so patch the manifest namespace, not the apps re-export.
    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(return_value=manifest)) as mock_fetch:
        response = test_client.get("/api/apps")

    assert response.status_code == 200
    assert mock_fetch.await_count == 1

    body = response.json()
    # The backfill only fills the manifest; the (possibly user-chosen) name
    # and the requested revision are preserved.
    assert body[0]["name"] == "Custom Name"
    assert body[0]["branch"] == "dev"
    assert body[0]["manifest"]["name"] == "Fresh Name"

    # Row is persisted; subsequent reads hit the cache.
    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    assert rows[0].manifest is not None
    assert rows[0].manifest["name"] == "Fresh Name"
    assert rows[0].name == "Custom Name"
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
    # The saved name survives the cache repair; only the manifest is replaced.
    assert body[0]["name"] == "Demo App"
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
               new=AsyncMock(return_value=("main", TEST_SHA, [("", manifest)]))), \
         _patch_snapshot() as mock_snapshot:
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
    assert body[0]["commit_sha"] == TEST_SHA
    assert body[0]["manifest"]["name"] == "From Add"

    # The pinned snapshot is materialized eagerly, at the discovered tip.
    assert mock_snapshot.await_count == 1
    assert mock_snapshot.await_args.args == ("https://github.com/owner/repo/tree/main",)
    assert mock_snapshot.await_args.kwargs == {
        "sha": TEST_SHA,
        "username": TEST_USERNAME,
    }

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    assert rows[0].manifest["name"] == "From Add"
    assert rows[0].branch == ""
    assert rows[0].commit_sha == TEST_SHA


def test_add_app_pins_separate_code_repo(test_client, db_session):
    """A manifest with a separate repo_url gets its code repo pinned at add
    time, so a later launch can't run code that moved after the app was added."""
    manifest = AppManifest(
        name="With Code Repo",
        description="Demo",
        repo_url="https://github.com/tools/code",
        runnables=[AppEntryPoint(id="run", name="Run", command="echo hi")],
    )

    def _snapshot(url, *args, **kwargs):
        if "tools/code" in url:
            return (f"/tmp/snapshots/{TEST_SHA_2}", TEST_SHA_2)
        return (f"/tmp/snapshots/{TEST_SHA}", TEST_SHA)

    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=("main", TEST_SHA, [("", manifest)]))), \
         patch("fileglancer.apps.ensure_repo_snapshot",
               new=AsyncMock(side_effect=_snapshot)) as mock_snapshot:
        response = test_client.post(
            "/api/apps",
            json={"url": "https://github.com/owner/repo"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body[0]["code_commit_sha"] == TEST_SHA_2

    # Two snapshots: the app repo (pinned tip) and the separate code repo.
    assert mock_snapshot.await_count == 2
    code_call = mock_snapshot.await_args_list[1]
    assert code_call.args == ("https://github.com/tools/code",)
    assert code_call.kwargs == {"pull": True, "username": TEST_USERNAME}

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert rows[0].commit_sha == TEST_SHA
    assert rows[0].code_commit_sha == TEST_SHA_2


def test_add_app_bakes_resolved_default_into_url(test_client, db_session):
    """A bare URL for a repo whose default is 'master' stores '/tree/master', so
    it dedups against an explicit '/tree/master' add. branch stays "" (unpinned)."""
    manifest = _make_manifest(name="Master Default")
    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=("master", TEST_SHA, [("", manifest)]))), \
         _patch_snapshot():
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


def test_add_uses_worker_resolved_branch_not_server(test_client, db_session):
    """The branch is resolved in the worker (as the user), not the server. add()
    must not call the server-side default-branch resolver — otherwise a private
    repo's non-main default would be lost to the server's 'main' fallback."""
    manifest = _make_manifest(name="Private")
    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=("develop", TEST_SHA, [("", manifest)]))), \
         patch("fileglancer.apps.manifest._resolve_default_branch",
               new=AsyncMock(side_effect=AssertionError("server must not resolve"))), \
         _patch_snapshot():
        response = test_client.post(
            "/api/apps",
            json={"url": "https://github.com/owner/private-repo"},
        )

    assert response.status_code == 200
    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    # The worker-resolved default (develop) is baked into the stored URL.
    assert rows[0].url == "https://github.com/owner/private-repo/tree/develop"
    assert rows[0].branch == ""


def test_add_app_pinned_revision_kept(test_client, db_session):
    """An explicit '/tree/dev' URL is pinned: branch records 'dev'."""
    manifest = _make_manifest(name="Pinned")
    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=("dev", TEST_SHA, [("", manifest)]))), \
         _patch_snapshot():
        response = test_client.post(
            "/api/apps",
            json={"url": "https://github.com/owner/repo/tree/dev"},
        )

    assert response.status_code == 200
    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    assert rows[0].url == "https://github.com/owner/repo/tree/dev"
    assert rows[0].branch == "dev"


def test_discover_lists_all_apps(test_client):
    """POST /api/apps/discover returns every manifest in the repo without adding."""
    m1 = _make_manifest(name="VS Code", description="IDE")
    m2 = _make_manifest(name="JupyterLab", description="Notebook")
    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=("main", TEST_SHA, [("vscode", m1), ("jupyterlab", m2)]))):
        response = test_client.post(
            "/api/apps/discover",
            json={"url": "https://github.com/owner/monorepo"},
        )

    assert response.status_code == 200
    body = response.json()
    assert [a["manifest_path"] for a in body] == ["vscode", "jupyterlab"]
    assert [a["name"] for a in body] == ["VS Code", "JupyterLab"]
    assert all(a["already_added"] is False for a in body)
    # Discovery must not create any rows.
    assert test_client.get("/api/apps").json() == []


def test_discover_marks_already_added(test_client, db_session):
    """Apps the user already has are flagged already_added=True."""
    m1 = _make_manifest(name="VS Code")
    m2 = _make_manifest(name="JupyterLab")
    _seed_app(db_session, url="https://github.com/owner/monorepo",
              manifest_path="vscode", branch="",
              manifest=m1.model_dump(mode="json"))
    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=("main", TEST_SHA, [("vscode", m1), ("jupyterlab", m2)]))):
        response = test_client.post(
            "/api/apps/discover",
            json={"url": "https://github.com/owner/monorepo"},
        )

    assert response.status_code == 200
    by_path = {a["manifest_path"]: a for a in response.json()}
    assert by_path["vscode"]["already_added"] is True
    assert by_path["jupyterlab"]["already_added"] is False


def test_discover_no_manifests_404(test_client):
    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=("main", TEST_SHA, []))):
        response = test_client.post(
            "/api/apps/discover",
            json={"url": "https://github.com/owner/empty"},
        )
    assert response.status_code == 404


def test_add_subset_via_manifest_paths(test_client, db_session):
    """manifest_paths adds only the selected apps, not the whole repo."""
    m1 = _make_manifest(name="VS Code")
    m2 = _make_manifest(name="JupyterLab")
    m3 = _make_manifest(name="marimo")
    discovered = [("vscode", m1), ("jupyterlab", m2), ("marimo", m3)]
    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=("main", TEST_SHA, discovered))), \
         _patch_snapshot():
        response = test_client.post(
            "/api/apps",
            json={
                "url": "https://github.com/owner/monorepo",
                "manifest_paths": ["vscode", "marimo"],
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert {a["manifest_path"] for a in body} == {"vscode", "marimo"}
    rows = list_user_apps(db_session, TEST_USERNAME)
    assert {r.manifest_path for r in rows} == {"vscode", "marimo"}


def test_add_null_manifest_paths_adds_all(test_client, db_session):
    """Omitting manifest_paths preserves the add-everything behavior."""
    m1 = _make_manifest(name="VS Code")
    m2 = _make_manifest(name="JupyterLab")
    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=("main", TEST_SHA, [("vscode", m1), ("jupyterlab", m2)]))), \
         _patch_snapshot():
        response = test_client.post(
            "/api/apps",
            json={"url": "https://github.com/owner/monorepo"},
        )

    assert response.status_code == 200
    assert len(response.json()) == 2
    assert len(list_user_apps(db_session, TEST_USERNAME)) == 2


def test_add_manifest_paths_no_match_400(test_client, db_session):
    """A manifest_paths list matching nothing in the repo is a client error."""
    m1 = _make_manifest(name="VS Code")
    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=("main", TEST_SHA, [("vscode", m1)]))):
        response = test_client.post(
            "/api/apps",
            json={
                "url": "https://github.com/owner/monorepo",
                "manifest_paths": ["does-not-exist"],
            },
        )

    assert response.status_code == 400
    assert len(list_user_apps(db_session, TEST_USERNAME)) == 0


def test_add_app_dedups_bare_against_resolved_default(test_client, db_session):
    """The dedup-hole fix: a bare URL for a master-default repo matches an already
    stored '/tree/master' row, so the add is a no-op (409)."""
    manifest = _make_manifest()
    _seed_app(db_session, url="https://github.com/owner/repo/tree/master",
              branch="", manifest=manifest.model_dump(mode="json"))

    with patch("fileglancer.apps.discover_app_manifests",
               new=AsyncMock(return_value=("master", TEST_SHA, [("", manifest)]))):
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
               new=AsyncMock(return_value=("main", TEST_SHA, [("", manifest)]))):
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
               new=AsyncMock(return_value=fresh)) as mock_fetch, \
         patch("fileglancer.apps.manifest._resolve_default_branch",
               new=AsyncMock(side_effect=AssertionError("must not re-resolve"))), \
         _patch_snapshot() as mock_snapshot:
        response = test_client.post(
            "/api/apps/update",
            json={"url": "https://github.com/owner/repo", "manifest_path": ""},
        )

    assert response.status_code == 200
    assert mock_snapshot.await_count == 1
    assert mock_snapshot.await_args.kwargs == {
        "pull": True,
        "username": TEST_USERNAME,
    }
    # A stored bare URL means the fixed "main" revision, not current default.
    assert mock_snapshot.await_args.args == ("https://github.com/owner/repo/tree/main",)
    # The manifest is read from the freshly pinned snapshot, not the branch clone.
    assert mock_fetch.await_args.kwargs["sha"] == TEST_SHA
    body = response.json()
    assert body["url"] == "https://github.com/owner/repo"
    assert body["name"] == "New"
    assert body["commit_sha"] == TEST_SHA
    assert body["updated_at"] is not None

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    assert rows[0].url == "https://github.com/owner/repo"
    assert rows[0].name == "New"
    assert rows[0].manifest["name"] == "New"
    assert rows[0].commit_sha == TEST_SHA
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
         patch("fileglancer.apps.manifest._resolve_default_branch",
               new=AsyncMock(side_effect=AssertionError("must not re-resolve"))), \
         _patch_snapshot() as mock_snapshot:
        response = test_client.post(
            "/api/apps/update",
            json={"url": "https://github.com/owner/repo", "manifest_path": ""},
        )

    assert response.status_code == 200
    assert mock_snapshot.await_count == 2
    first_call, second_call = mock_snapshot.await_args_list
    assert first_call.args == ("https://github.com/owner/repo/tree/main",)
    assert first_call.kwargs == {"pull": True, "username": TEST_USERNAME}
    assert second_call.args == ("https://github.com/tools/code",)
    assert second_call.kwargs == {"pull": True, "username": TEST_USERNAME}

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert rows[0].manifest["repo_url"] == "https://github.com/tools/code"
    # Both repos are pinned: the app repo and the separate code repo.
    assert rows[0].commit_sha == TEST_SHA
    assert rows[0].code_commit_sha == TEST_SHA


def test_update_app_does_not_pull_same_repo_with_cosmetic_url(test_client, db_session):
    """A manifest repo_url that canonicalizes to the stored app URL is the same
    repo, even when the operational clone URL had to make /tree/main explicit."""
    _seed_app(db_session, url="https://github.com/owner/repo", branch="",
              manifest=None, name="Old")

    fresh = AppManifest(
        name="New",
        description="New",
        repo_url="https://github.com/owner/repo/tree/main",
        runnables=[AppEntryPoint(id="run", name="Run", command="echo hi")],
    )

    with patch("fileglancer.apps.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)), \
         patch("fileglancer.apps.manifest._resolve_default_branch",
               new=AsyncMock(side_effect=AssertionError("must not re-resolve"))), \
         _patch_snapshot() as mock_snapshot:
        response = test_client.post(
            "/api/apps/update",
            json={"url": "https://github.com/owner/repo", "manifest_path": ""},
        )

    assert response.status_code == 200
    assert mock_snapshot.await_count == 1
    assert mock_snapshot.await_args.args == (
        "https://github.com/owner/repo/tree/main",
    )


@pytest.mark.parametrize(
    "stored_url,stored_branch,clone_url",
    [
        # Stored bare URL is the fixed main revision; operational git calls make
        # that explicit so they don't follow a moved default branch.
        ("https://github.com/owner/repo", "", "https://github.com/owner/repo/tree/main"),
        # Unpinned app pinned to master at add time.
        ("https://github.com/owner/repo/tree/master", "", "https://github.com/owner/repo/tree/master"),
        # Explicitly pinned app.
        ("https://github.com/owner/repo/tree/dev", "dev", "https://github.com/owner/repo/tree/dev"),
    ],
)
def test_update_pulls_stored_revision_and_never_re_resolves(
    test_client, db_session, stored_url, stored_branch, clone_url
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
         _patch_snapshot() as mock_snapshot:
        response = test_client.post(
            "/api/apps/update",
            json={"url": stored_url, "manifest_path": ""},
        )

    assert response.status_code == 200
    assert mock_snapshot.await_args_list[0].args == (clone_url,)
    body = response.json()
    assert body["url"] == stored_url
    assert body["branch"] == stored_branch
    assert body["manifest"]["name"] == "New"

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert len(rows) == 1
    assert rows[0].url == stored_url
    # The revision fixed at add time is preserved.
    assert rows[0].branch == stored_branch


def test_update_repins_only_target_app(test_client, db_session):
    """The core pinning invariant: updating one app in a multi-app repo moves
    only that app's pin. Sibling apps keep their commit (and their snapshot)."""
    m1 = _make_manifest(name="VS Code")
    m2 = _make_manifest(name="JupyterLab")
    _seed_app(db_session, url="https://github.com/owner/monorepo",
              manifest_path="vscode", branch="", commit_sha=TEST_SHA,
              manifest=m1.model_dump(mode="json"), name="VS Code")
    _seed_app(db_session, url="https://github.com/owner/monorepo",
              manifest_path="jupyterlab", branch="", commit_sha=TEST_SHA,
              manifest=m2.model_dump(mode="json"), name="JupyterLab")

    with patch("fileglancer.apps.fetch_app_manifest",
               new=AsyncMock(return_value=m1)), \
         _patch_snapshot(sha=TEST_SHA_2):
        response = test_client.post(
            "/api/apps/update",
            json={"url": "https://github.com/owner/monorepo",
                  "manifest_path": "vscode"},
        )

    assert response.status_code == 200
    assert response.json()["commit_sha"] == TEST_SHA_2

    rows = {r.manifest_path: r for r in list_user_apps(db_session, TEST_USERNAME)}
    assert rows["vscode"].commit_sha == TEST_SHA_2
    assert rows["jupyterlab"].commit_sha == TEST_SHA


def test_check_updates_reports_newer_remote_tip(test_client, db_session):
    """An app pinned behind the remote tip is flagged; one at the tip is not.
    Apps from the same repo+revision share a single remote lookup."""
    m = _make_manifest()
    _seed_app(db_session, url="https://github.com/owner/monorepo",
              manifest_path="vscode", branch="", commit_sha=TEST_SHA,
              manifest=m.model_dump(mode="json"))
    _seed_app(db_session, url="https://github.com/owner/monorepo",
              manifest_path="jupyterlab", branch="", commit_sha=TEST_SHA_2,
              manifest=m.model_dump(mode="json"))

    with patch("fileglancer.apps.get_remote_heads",
               new=AsyncMock(return_value={
                   "https://github.com/owner/monorepo/tree/main": TEST_SHA_2,
               })) as mock_heads:
        response = test_client.get("/api/apps/check-updates")

    assert response.status_code == 200
    assert mock_heads.await_count == 1  # one batched lookup for both apps
    by_path = {r["manifest_path"]: r for r in response.json()}
    assert by_path["vscode"]["update_available"] is True
    assert by_path["vscode"]["latest_sha"] == TEST_SHA_2
    assert by_path["jupyterlab"]["update_available"] is False


def test_check_updates_skips_unpinned_rows(test_client, db_session):
    """Legacy rows without a pin can't be compared — no badge, no remote call."""
    _seed_app(db_session, manifest=_make_manifest().model_dump(mode="json"),
              branch="", commit_sha=None)

    with patch("fileglancer.apps.get_remote_heads",
               new=AsyncMock()) as mock_heads:
        response = test_client.get("/api/apps/check-updates")

    assert response.status_code == 200
    assert mock_heads.await_count == 0
    body = response.json()
    assert len(body) == 1
    assert body[0]["update_available"] is False


def test_check_updates_remote_failure_is_not_an_error(test_client, db_session):
    """An unreachable remote yields update_available=False, not a 5xx."""
    _seed_app(db_session, manifest=_make_manifest().model_dump(mode="json"),
              branch="", commit_sha=TEST_SHA)

    with patch("fileglancer.apps.get_remote_heads",
               new=AsyncMock(side_effect=RuntimeError("network down"))):
        response = test_client.get("/api/apps/check-updates")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["update_available"] is False
    assert body[0]["latest_sha"] is None


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


@pytest.mark.parametrize("status", ["PENDING", "RUNNING", "UNKNOWN", "SUSPENDED"])
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


def test_delete_finished_job_removes_work_dir(test_client, db_session, temp_dir):
    job = _seed_job(db_session, status="DONE")
    job_id = job.id
    work_dir = os.path.join(
        temp_dir,
        ".fileglancer",
        "jobs",
        f"{job_id}-Demo_App-run",
    )
    os.makedirs(work_dir)
    with open(os.path.join(work_dir, "stdout.log"), "w", encoding="utf-8") as f:
        f.write("job output")

    job.work_dir = work_dir
    db_session.commit()

    response = test_client.delete(f"/api/jobs/{job_id}")

    assert response.status_code == 200
    assert not os.path.exists(work_dir)
    db_session.expire_all()
    assert get_job(db_session, job_id, TEST_USERNAME) is None


def test_cluster_defaults_preserves_extra_args_tokens(temp_dir):
    """Cluster default extra_args are shell-quoted so the launch form can submit
    them back through shlex.split without losing spaces or scheduler syntax."""
    args = ["-P", "project with spaces", "-R", "select[mem>8000] rusage[mem=8000]"]
    settings = Settings(
        db_url=f"sqlite:///{os.path.join(temp_dir, 'defaults.db')}",
        file_share_mounts=[],
        cli_mode=True,
        cluster={"extra_args": args},
    )
    client = TestClient(create_app(settings))

    response = client.get("/api/cluster-defaults")

    assert response.status_code == 200
    value = response.json()["extra_args"]
    assert value == shlex.join(args)
    assert shlex.split(value) == args


# --- Job endpoints (submit, list, get, cancel, files, validate-paths) ---


def _install_app_with_manifest(db_session, name="My Custom Name"):
    """Seed an installed, pinned app whose manifest is cached in the DB, so
    submit_job's manifest load never touches git or the worker."""
    manifest = _make_manifest(name="Manifest Name")
    return _seed_app(db_session, manifest=manifest.model_dump(mode="json"),
                     name=name, commit_sha=TEST_SHA)


def test_submit_job_creates_pending_job(test_client, db_session):
    _install_app_with_manifest(db_session)
    dispatch = AsyncMock(return_value={
        "job_id": "lsf-123",
        "script_path": "/home/u/.fileglancer/jobs/1-demo-run/script.sh",
        "work_dir_fsp_name": "home",
        "work_dir_subpath": ".fileglancer/jobs/1-demo-run",
    })

    with patch("fileglancer.apps.jobs._dispatch", new=dispatch), \
         patch("fileglancer.apps.jobs.ensure_repo_snapshot",
               new=AsyncMock(return_value=("/tmp/snapshots/x", TEST_SHA))), \
         patch("fileglancer.apps.jobs.ensure_poll_loop", new=lambda: None):
        response = test_client.post("/api/jobs", json={
            "app_url": "https://github.com/owner/repo",
            "entry_point_id": "run",
            "parameters": {},
            "resources": {"cpus": 2},
            "extra_args": "-P proj -W 60",
        })

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "PENDING"
    assert body["cluster_job_id"] == "lsf-123"
    # The job is labeled with the name the user saved for the app, not the
    # raw manifest name.
    assert body["app_name"] == "My Custom Name"
    assert body["commit_sha"] == TEST_SHA

    # The worker received the resource overrides, with the extra_args string
    # split into distinct argv tokens for the scheduler.
    submit_calls = [c for c in dispatch.await_args_list if c.args[1] == "submit"]
    assert len(submit_calls) == 1
    resources = submit_calls[0].kwargs["resources"]
    assert resources["cpus"] == 2
    assert resources["extra_args"] == ["-P", "proj", "-W", "60"]

    db_session.expire_all()
    assert get_job(db_session, body["id"], TEST_USERNAME).status == "PENDING"


def test_submit_job_unknown_entry_point_400(test_client, db_session):
    _install_app_with_manifest(db_session)

    response = test_client.post("/api/jobs", json={
        "app_url": "https://github.com/owner/repo",
        "entry_point_id": "nope",
        "parameters": {},
    })

    assert response.status_code == 400
    assert "Entry point" in response.json()["error"]


def test_get_jobs_lists_and_filters_by_status(test_client, db_session):
    done = _seed_job(db_session, status="DONE")
    running = _seed_job(db_session, status="RUNNING")

    response = test_client.get("/api/jobs")
    assert response.status_code == 200
    assert {j["id"] for j in response.json()["jobs"]} == {done.id, running.id}

    response = test_client.get("/api/jobs", params={"status": "DONE"})
    jobs = response.json()["jobs"]
    assert [j["id"] for j in jobs] == [done.id]
    assert jobs[0]["status"] == "DONE"


def test_get_active_job_count(test_client, db_session):
    """The badge count endpoint counts running/pending jobs only. UNKNOWN
    doesn't count here (unlike get_active_jobs's polling/delete guard) since
    the scheduler can't confirm it's actually running; DONE/FAILED/KILLED are
    terminal."""
    _seed_job(db_session, status="DONE")
    _seed_job(db_session, status="FAILED")
    _seed_job(db_session, status="PENDING")
    _seed_job(db_session, status="RUNNING")
    _seed_job(db_session, status="UNKNOWN")

    response = test_client.get("/api/jobs/active-count")

    assert response.status_code == 200
    assert response.json() == {"count": 2}


def test_get_jobs_listing_skips_service_url_resolution(test_client, db_session, temp_dir):
    """The listing is a pure DB read: it does not resolve service URLs from
    work dirs (only the UI's job detail page shows them, and the single-job
    endpoint resolves them itself)."""
    ready_dir = os.path.join(temp_dir, "svc-ready")
    os.makedirs(ready_dir)
    with open(os.path.join(ready_dir, "service_url"), "w", encoding="utf-8") as f:
        f.write("http://node1:8888\n")
    ready = _seed_job(db_session, status="RUNNING", entry_point_type="service",
                      work_dir=ready_dir)

    response = test_client.get("/api/jobs")

    assert response.status_code == 200
    by_id = {j["id"]: j for j in response.json()["jobs"]}
    assert by_id[ready.id]["service_url"] is None
    assert by_id[ready.id]["phase"] is None


def test_get_job_includes_file_paths(test_client, db_session):
    work_dir = "/home/u/.fileglancer/jobs/9-Demo_App-run"
    job = _seed_job(
        db_session, status="RUNNING",
        work_dir=work_dir,
        script_path=f"{work_dir}/job.sh",
        started_at=datetime.now(UTC),
        work_dir_fsp_name="home",
        work_dir_subpath=".fileglancer/jobs/9-Demo_App-run",
    )

    response = test_client.get(f"/api/jobs/{job.id}")

    assert response.status_code == 200
    files = response.json()["files"]
    assert files["script"]["path"] == f"{work_dir}/job.sh"
    assert files["script"]["exists"] is True
    assert files["stdout"]["path"] == f"{work_dir}/stdout.log"
    assert files["stdout"]["exists"] is True
    assert files["stdout"]["fsp_name"] == "home"
    assert files["stdout"]["subpath"] == ".fileglancer/jobs/9-Demo_App-run/stdout.log"
    assert files["work_dir"]["subpath"] == ".fileglancer/jobs/9-Demo_App-run"


def test_get_job_missing_404(test_client):
    response = test_client.get("/api/jobs/9999")
    assert response.status_code == 404


def test_cancel_running_job(test_client, db_session):
    job = _seed_job(db_session, status="RUNNING",
                    work_dir="/home/u/.fileglancer/jobs/1-Demo_App-run",
                    cluster_job_id="lsf-1")
    # All executors cancel through the single "cancel" worker action, which
    # delegates to py-cluster-api's executor.cancel(job_id).
    dispatch = AsyncMock(return_value={"status": "ok"})

    with patch("fileglancer.apps.jobs._dispatch", new=dispatch):
        response = test_client.post(f"/api/jobs/{job.id}/cancel")

    assert response.status_code == 200
    # A cancelled batch job is recorded as KILLED, same as always.
    assert response.json()["status"] == "KILLED"
    assert response.json()["finished_at"] is not None
    assert dispatch.await_args.args[1] == "cancel"
    assert dispatch.await_args.kwargs["done"] is False
    db_session.expire_all()
    assert get_job(db_session, job.id, TEST_USERNAME).status == "KILLED"


def test_cancel_running_service(test_client, db_session):
    job = _seed_job(db_session, status="RUNNING", entry_point_type="service",
                    work_dir="/home/u/.fileglancer/jobs/1-Demo_App-run",
                    cluster_job_id="lsf-1")
    dispatch = AsyncMock(return_value={"status": "ok"})

    with patch("fileglancer.apps.jobs._dispatch", new=dispatch):
        response = test_client.post(f"/api/jobs/{job.id}/cancel")

    assert response.status_code == 200
    # A stopped service is recorded as DONE, same as any completed pipeline,
    # and asks the scheduler to mark the job done via done=True, since
    # stopping it is a normal user action.
    assert response.json()["status"] == "DONE"
    assert response.json()["finished_at"] is not None
    assert dispatch.await_args.kwargs["done"] is True
    db_session.expire_all()
    assert get_job(db_session, job.id, TEST_USERNAME).status == "DONE"


@pytest.mark.parametrize("status", ["DONE", "FAILED", "KILLED"])
def test_cancel_terminal_job_400(test_client, db_session, status):
    job = _seed_job(db_session, status=status)

    response = test_client.post(f"/api/jobs/{job.id}/cancel")

    assert response.status_code == 400
    assert "not cancellable" in response.json()["error"]
    db_session.expire_all()
    assert get_job(db_session, job.id, TEST_USERNAME).status == status


def test_get_job_file_returns_content(test_client, db_session, temp_dir):
    work_dir = os.path.join(temp_dir, "job1")
    os.makedirs(work_dir)
    with open(os.path.join(work_dir, "stdout.log"), "w", encoding="utf-8") as f:
        f.write("hello from the job\n")
    script_path = os.path.join(work_dir, "job.sh")
    with open(script_path, "w", encoding="utf-8") as f:
        f.write("#!/bin/bash\necho hi\n")
    job = _seed_job(db_session, status="DONE", work_dir=work_dir,
                    script_path=script_path)

    response = test_client.get(f"/api/jobs/{job.id}/files/stdout")
    assert response.status_code == 200
    assert response.text == "hello from the job\n"

    response = test_client.get(f"/api/jobs/{job.id}/files/script")
    assert response.status_code == 200
    assert response.text == "#!/bin/bash\necho hi\n"


def test_get_job_file_missing_file_404(test_client, db_session, temp_dir):
    work_dir = os.path.join(temp_dir, "job2")
    os.makedirs(work_dir)
    job = _seed_job(db_session, status="DONE", work_dir=work_dir)

    response = test_client.get(f"/api/jobs/{job.id}/files/stderr")

    assert response.status_code == 404
    assert "File not found" in response.json()["error"]


def test_get_job_file_invalid_type_400(test_client, db_session):
    job = _seed_job(db_session, status="DONE")

    response = test_client.get(f"/api/jobs/{job.id}/files/env")

    assert response.status_code == 400


def test_get_job_file_unknown_job_404(test_client):
    response = test_client.get("/api/jobs/9999/files/stdout")
    assert response.status_code == 404


def test_validate_paths_endpoint(test_client, db_session, temp_dir):
    # With settings.file_share_mounts empty, file shares come from the DB.
    db_session.add(FileSharePathDB(
        name="scratch", zone="Local", group="local", storage="local",
        mount_path=temp_dir, mac_path=temp_dir, windows_path=temp_dir,
        linux_path=temp_dir,
    ))
    db_session.commit()
    inside = os.path.join(temp_dir, "data.txt")
    with open(inside, "w", encoding="utf-8") as f:
        f.write("x")

    response = test_client.post("/api/apps/validate-paths", json={
        "paths": {
            "input": inside,
            "outside": "/definitely/not/shared/file.txt",
            "output": os.path.join(temp_dir, "results"),
            "wrongtype": temp_dir,
        },
        "may_be_missing": ["output"],
        "types": {"input": "file", "wrongtype": "file"},
    })

    assert response.status_code == 200
    errors = response.json()["errors"]
    assert "input" not in errors
    # exists=false outputs are containment-checked only.
    assert "output" not in errors
    assert "not within an allowed file share" in errors["outside"]
    assert "a file is required" in errors["wrongtype"]


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
    """If a pinned row has a NULL manifest, the endpoint reads disk and writes
    back, fetching the pinned (explicit) URL."""
    _seed_app(db_session, manifest=None, name="Stale", branch="")
    fresh = _make_manifest(name="Backfilled")

    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)) as mock_fetch:
        response = test_client.post("/api/apps/manifest", json={
            "url": "https://github.com/owner/repo",
            "manifest_path": "",
        })

    assert response.status_code == 200
    assert mock_fetch.await_count == 1
    # branch="" is a pinned "main", so the fetch URL is made explicit.
    assert mock_fetch.await_args.args == (
        "https://github.com/owner/repo/tree/main",
        "",
    )
    assert response.json()["name"] == "Backfilled"


def test_fetch_manifest_legacy_null_branch_tracks_default(test_client, db_session):
    """A legacy row with NULL branch (unknown default) is fetched with its stored
    bare URL — git resolves the default — rather than being pinned to main."""
    _seed_app(db_session, manifest=None, name="Legacy", branch=None)
    fresh = _make_manifest(name="Backfilled")

    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)) as mock_fetch:
        response = test_client.post("/api/apps/manifest", json={
            "url": "https://github.com/owner/repo",
            "manifest_path": "",
        })

    assert response.status_code == 200
    assert mock_fetch.await_args.args == ("https://github.com/owner/repo", "")

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

    _seed_app(db_session, url="https://github.com/owner/repo/tree/dev",
              manifest=None, name="Custom Name", branch="dev")
    fresh = _make_manifest(name="Synced")

    with patch("fileglancer.apps.manifest.fetch_app_manifest",
               new=AsyncMock(return_value=fresh)) as mock_fetch, \
         patch("fileglancer.apps.manifest._resolve_default_branch",
               new=AsyncMock(side_effect=AssertionError("must not re-resolve"))):
        manifest = await refresh_cached_manifest(
            TEST_USERNAME, "https://github.com/owner/repo/tree/dev", "",
        )

    assert manifest.name == "Synced"
    assert mock_fetch.await_args.args == (
        "https://github.com/owner/repo/tree/dev",
        "",
    )

    rows = list_user_apps(db_session, TEST_USERNAME)
    assert rows[0].manifest["name"] == "Synced"
    # A cache refresh leaves the (possibly user-chosen) name and the requested
    # revision (branch) untouched.
    assert rows[0].name == "Custom Name"
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

    # 3) Run our migration (and everything after it, so the schema matches
    # the current models used to query below).
    command.upgrade(cfg, "head")

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


def test_rename_app_sets_display_name_and_survives_update(test_client, db_session):
    _seed_app(db_session, manifest=_make_manifest().model_dump(mode="json"))

    response = test_client.patch(
        "/api/apps",
        json={"url": "https://github.com/owner/repo", "manifest_path": "",
              "name": "  My Fork  "},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "My Fork"

    # The manifest name stays in `name`; the user's label lives beside it.
    row = get_user_app(db_session, TEST_USERNAME, "https://github.com/owner/repo")
    db_session.refresh(row)
    assert row.name == "Demo App"
    assert row.display_name == "My Fork"

    # Listing and updating report the custom name, not the manifest's.
    assert test_client.get("/api/apps").json()[0]["name"] == "My Fork"
    with patch("fileglancer.apps.fetch_app_manifest",
               new=AsyncMock(return_value=_make_manifest(name="Renamed Upstream"))), \
         _patch_snapshot(TEST_SHA_2):
        response = test_client.post(
            "/api/apps/update",
            json={"url": "https://github.com/owner/repo", "manifest_path": ""},
        )
    assert response.status_code == 200
    assert response.json()["name"] == "My Fork"
    db_session.refresh(row)
    assert row.name == "Renamed Upstream"
    assert row.display_name == "My Fork"

    # An empty name clears the custom label and falls back to the manifest.
    response = test_client.patch(
        "/api/apps",
        json={"url": "https://github.com/owner/repo", "name": ""},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed Upstream"
    db_session.refresh(row)
    assert row.display_name is None


def test_rename_app_unknown_returns_404(test_client):
    response = test_client.patch(
        "/api/apps",
        json={"url": "https://github.com/owner/nope", "name": "x"},
    )
    assert response.status_code == 404
