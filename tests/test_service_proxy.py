"""Tests for the app service HTTPS proxy: URL caching, rewriting, and resolution."""

import os
import shutil
import tempfile

import pytest
from fastapi.testclient import TestClient
from urllib.parse import urlsplit

from fileglancer import apps
from fileglancer.settings import Settings, AppsSettings
from fileglancer.server import create_app, get_current_user
from fileglancer.database import (
    Base,
    create_engine,
    dispose_engine,
    get_db_session,
    create_job,
    get_job_by_id,
    set_job_service_url,
)

OWNER = "alice"
PROXY_DOMAIN = "services.example.org"
SECRET = "test-session-secret"


def _host(job_id):
    """The signed proxy hostname for a job, as the API would publish it."""
    return f"{apps.service_host_label(job_id, SECRET)}.{PROXY_DOMAIN}"


@pytest.fixture
def temp_dir():
    d = tempfile.mkdtemp()
    yield d
    shutil.rmtree(d)


@pytest.fixture
def settings_factory(temp_dir):
    """Build Settings against a fresh sqlite database, with the proxy domain
    configurable so the same fixtures cover both the on and off cases.

    Engines are tracked and disposed on teardown. Windows keeps a lock on an
    open sqlite file, so leaving one open makes the temp_dir fixture's rmtree
    fail with WinError 32. Teardown runs in reverse dependency order, which puts
    this disposal before that rmtree.
    """
    engines = []

    def _build(proxy_domain="", upstream_zone=""):
        db_path = os.path.join(temp_dir, "test.db")
        db_url = f"sqlite:///{db_path}"
        engine = create_engine(db_url)
        engines.append(engine)
        Base.metadata.create_all(engine)
        return Settings(
            db_url=db_url,
            file_share_mounts=[],
            cli_mode=True,
            session_secret_key=SECRET,
            apps=AppsSettings(service_proxy_domain=proxy_domain,
                              service_proxy_upstream_zone=upstream_zone),
        ), db_url

    yield _build

    for engine in engines:
        engine.dispose()


@pytest.fixture
def app_factory(settings_factory):
    """Build the FastAPI app. Patches fileglancer.settings.get_settings because
    database and server code call it directly rather than taking it as an
    argument."""
    built = []

    def _build(proxy_domain="", upstream_zone=""):
        settings, db_url = settings_factory(proxy_domain, upstream_zone)
        import fileglancer.settings
        import fileglancer.database
        original = fileglancer.settings.get_settings
        fileglancer.settings.get_settings = lambda: settings
        fileglancer.database.get_settings = lambda: settings
        fileglancer.database._migrations_run = True
        built.append((db_url, original))
        return create_app(settings), db_url

    yield _build

    import fileglancer.settings
    import fileglancer.database
    for db_url, original in built:
        dispose_engine(db_url)
        fileglancer.settings.get_settings = original
        fileglancer.database.get_settings = original
    fileglancer.database._migrations_run = False


def _seed_service_job(db_url, status="RUNNING", entry_point_type="service"):
    session = get_db_session(db_url)
    try:
        job = create_job(
            session, OWNER, "https://github.com/owner/repo",
            "My App", "serve", "Server", {},
            entry_point_type=entry_point_type,
        )
        job.status = status
        session.commit()
        return job.id
    finally:
        session.close()


def test_set_job_service_url_persists(app_factory):
    _, db_url = app_factory()
    job_id = _seed_service_job(db_url)

    session = get_db_session(db_url)
    try:
        assert get_job_by_id(session, job_id).service_url is None
    finally:
        session.close()

    session = get_db_session(db_url)
    try:
        set_job_service_url(session, job_id, "http://node01:41235/lab?token=abc")
    finally:
        session.close()

    session = get_db_session(db_url)
    try:
        assert get_job_by_id(session, job_id).service_url == "http://node01:41235/lab?token=abc"
    finally:
        session.close()


def test_get_job_by_id_ignores_username(app_factory):
    """Resolution happens with no authenticated user, so the lookup must not
    require one."""
    _, db_url = app_factory()
    job_id = _seed_service_job(db_url)
    session = get_db_session(db_url)
    try:
        assert get_job_by_id(session, job_id).id == job_id
        assert get_job_by_id(session, job_id + 999) is None
    finally:
        session.close()


def test_get_job_caches_service_url(app_factory, monkeypatch):
    """Opening the job detail page is the only way to obtain a proxied URL, so
    it is where the cache gets populated — no new poll-loop work needed.

    `_worker_exec` is a closure local of `create_app` (not a module attribute),
    so it can't be monkeypatched from outside. In CLI mode (used by these
    fixtures) it dispatches in-process to the `get_service_url` action, which
    calls fileglancer.apps.jobfiles.get_service_url/get_service_phase — patch
    those instead, which also exercises the real CLI-mode dispatch path.
    """
    app, db_url = app_factory()
    job_id = _seed_service_job(db_url)

    import fileglancer.apps.jobfiles as jobfiles
    monkeypatch.setattr(jobfiles, "get_service_url",
                         lambda db_job: "http://node01:41235/lab?token=abc")
    monkeypatch.setattr(jobfiles, "get_service_phase", lambda db_job: "running")

    app.dependency_overrides[get_current_user] = lambda: OWNER
    client = TestClient(app)
    resp = client.get(f"/api/jobs/{job_id}")
    app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json()["service_url"] == "http://node01:41235/lab?token=abc"

    session = get_db_session(db_url)
    try:
        assert get_job_by_id(session, job_id).service_url == "http://node01:41235/lab?token=abc"
    finally:
        session.close()


# --- /api/apps/resolve ---

def _resolve(app, host):
    return TestClient(app).get("/api/apps/resolve", headers={"Host": host})


def _seed_running_service_with_url(db_url, url="http://node01:41235/lab?token=abc"):
    job_id = _seed_service_job(db_url)
    session = get_db_session(db_url)
    try:
        set_job_service_url(session, job_id, url)
    finally:
        session.close()
    return job_id


def test_resolve_returns_upstream(app_factory):
    app, db_url = app_factory(PROXY_DOMAIN)
    job_id = _seed_running_service_with_url(db_url)
    resp = _resolve(app, _host(job_id))
    assert resp.status_code == 204
    assert resp.headers["x-fg-upstream"] == "node01:41235"


def test_resolve_rejects_finished_job(app_factory):
    """Compute-node ports get recycled. A stale subdomain must not be proxied to
    whatever service now holds that port on that node."""
    app, db_url = app_factory(PROXY_DOMAIN)
    job_id = _seed_running_service_with_url(db_url)
    session = get_db_session(db_url)
    try:
        get_job_by_id(session, job_id).status = "DONE"
        session.commit()
    finally:
        session.close()
    resp = _resolve(app, _host(job_id))
    assert resp.status_code == 403
    assert "x-fg-upstream" not in resp.headers


def test_resolve_rejects_non_service_job(app_factory):
    app, db_url = app_factory(PROXY_DOMAIN)
    job_id = _seed_service_job(db_url, entry_point_type="job")
    session = get_db_session(db_url)
    try:
        set_job_service_url(session, job_id, "http://node01:41235/")
    finally:
        session.close()
    assert _resolve(app, _host(job_id)).status_code == 403


def test_resolve_rejects_job_without_cached_url(app_factory):
    app, db_url = app_factory(PROXY_DOMAIN)
    job_id = _seed_service_job(db_url)
    assert _resolve(app, _host(job_id)).status_code == 403


def test_resolve_rejects_unknown_job(app_factory):
    app, db_url = app_factory(PROXY_DOMAIN)
    assert _resolve(app, _host(999999)).status_code == 403


@pytest.mark.parametrize("host", [
    "fileglancer.example.org",
    "job-1.evil.example.org",
    "job-abc.services.example.org",
    "job-1.services.example.org",          # unsigned: the old, guessable form
    "job-1-aaaaaaaa.services.example.org", # wrong MAC
])
def test_resolve_rejects_bad_hosts(app_factory, host):
    app, db_url = app_factory(PROXY_DOMAIN)
    _seed_running_service_with_url(db_url)
    assert _resolve(app, host).status_code == 403


def test_resolve_disabled_when_no_proxy_domain(app_factory):
    """With the feature off, the endpoint refuses everything."""
    app, db_url = app_factory("")
    job_id = _seed_running_service_with_url(db_url)
    assert _resolve(app, _host(job_id)).status_code == 403


# --- proxied URL publication ---

def _get_job_with_worker_url(app, job_id, url, monkeypatch):
    """Drive get_job's service-url resolution without touching _worker_exec,
    which is a closure local of create_app (not a module attribute) and can't
    be monkeypatched from outside. In CLI mode (used by these fixtures)
    _worker_exec dispatches in-process to the get_service_url action, which
    calls fileglancer.apps.jobfiles.get_service_url/get_service_phase — patch
    those instead, matching test_get_job_caches_service_url above."""
    import fileglancer.apps.jobfiles as jobfiles
    monkeypatch.setattr(jobfiles, "get_service_url", lambda db_job: url)
    monkeypatch.setattr(jobfiles, "get_service_phase", lambda db_job: "running")
    app.dependency_overrides[get_current_user] = lambda: OWNER
    try:
        return TestClient(app).get(f"/api/jobs/{job_id}")
    finally:
        app.dependency_overrides.clear()


def test_job_detail_publishes_proxied_url(app_factory, monkeypatch):
    app, db_url = app_factory(PROXY_DOMAIN)
    job_id = _seed_service_job(db_url)
    resp = _get_job_with_worker_url(
        app, job_id, "http://node01:41235/lab?token=abc", monkeypatch)
    assert resp.status_code == 200
    assert resp.json()["service_url"] == \
        f"https://{_host(job_id)}/lab?token=abc"


def test_job_detail_publishes_raw_url_when_proxy_disabled(app_factory, monkeypatch):
    """The off switch: unchanged behavior, byte for byte."""
    app, db_url = app_factory("")
    job_id = _seed_service_job(db_url)
    resp = _get_job_with_worker_url(
        app, job_id, "http://node01:41235/lab?token=abc", monkeypatch)
    assert resp.json()["service_url"] == "http://node01:41235/lab?token=abc"


def test_job_detail_caches_the_raw_url_not_the_proxied_one(app_factory, monkeypatch):
    """The cached value is the upstream, so it must stay in its raw form."""
    app, db_url = app_factory(PROXY_DOMAIN)
    job_id = _seed_service_job(db_url)
    _get_job_with_worker_url(
        app, job_id, "http://node01:41235/lab?token=abc", monkeypatch)
    session = get_db_session(db_url)
    try:
        assert get_job_by_id(session, job_id).service_url == \
            "http://node01:41235/lab?token=abc"
    finally:
        session.close()


def test_resolve_rejects_malformed_cached_url(app_factory):
    """SSRF regression test: the cached value comes from a file the user's own
    job wrote, and the result is interpolated into the proxy's proxy_pass."""
    app, db_url = app_factory(PROXY_DOMAIN)
    job_id = _seed_running_service_with_url(
        db_url, url="http://evil.example.org:80\r\nX-Injected: 1/")
    resp = _resolve(app, _host(job_id))
    assert resp.status_code == 403
    assert "x-fg-upstream" not in resp.headers


def test_resolve_rejects_upstream_outside_suffix(app_factory):
    """Proves apps.service_proxy_upstream_zone reaches the endpoint, not just
    the helper."""
    app, db_url = app_factory(PROXY_DOMAIN, upstream_zone=".nodes.example.org")
    job_id = _seed_running_service_with_url(db_url, url="http://127.0.0.1:8989/")
    resp = _resolve(app, _host(job_id))
    assert resp.status_code == 403
    assert "x-fg-upstream" not in resp.headers


def test_publish_then_resolve_roundtrip(app_factory, monkeypatch):
    """Closes the loop the other tests each cover only half of: the hostname the
    API publishes must be the one the resolve endpoint maps back to the raw
    compute-node upstream."""
    app, db_url = app_factory(PROXY_DOMAIN)
    job_id = _seed_service_job(db_url)
    published = _get_job_with_worker_url(
        app, job_id, "http://node01:41235/lab?token=abc", monkeypatch).json()["service_url"]
    assert published == f"https://{_host(job_id)}/lab?token=abc"
    resp = _resolve(app, urlsplit(published).netloc)
    assert resp.status_code == 204
    assert resp.headers["x-fg-upstream"] == "node01:41235"


# --- resolution cache and counters ---

def test_resolve_serves_repeats_from_the_cache(app_factory):
    """A page load is dozens of resolves, so repeats must not each hit the DB.

    Proven by making the DB answer change underneath: the row is moved to DONE,
    which would refuse a fresh lookup, and the cached upstream is still served.
    That is also an honest statement of the cache's cost — the TTL is the window
    in which a stopped job can still be proxied, which is why it is short."""
    app, db_url = app_factory(PROXY_DOMAIN)
    job_id = _seed_running_service_with_url(db_url)
    host = _host(job_id)

    assert _resolve(app, host).status_code == 204
    session = get_db_session(db_url)
    try:
        get_job_by_id(session, job_id).status = "DONE"
        session.commit()
    finally:
        session.close()

    second = _resolve(app, host)
    assert second.status_code == 204
    assert second.headers["x-fg-upstream"] == "node01:41235"
    assert apps.resolve_counts() == {"miss": 1, "hit": 1}


def test_resolve_does_not_cache_refusals(app_factory):
    """A service that has not published its URL yet must start resolving the
    moment it does, so a miss cannot be remembered."""
    app, db_url = app_factory(PROXY_DOMAIN)
    job_id = _seed_service_job(db_url)
    host = _host(job_id)

    assert _resolve(app, host).status_code == 403
    session = get_db_session(db_url)
    try:
        set_job_service_url(session, job_id, "http://node01:41235/lab")
    finally:
        session.close()

    assert _resolve(app, host).status_code == 204


def test_resolve_counts_refusals_by_reason(app_factory):
    """The counters replace per-request access logging, so they have to say
    which way a refusal went."""
    app, db_url = app_factory(PROXY_DOMAIN)
    job_id = _seed_service_job(db_url)

    _resolve(app, "not-a-proxy-host.example.org")
    _resolve(app, _host(job_id))

    assert apps.resolve_counts() == {
        "refused_bad_host": 1, "refused_no_upstream": 1}


def test_resolve_cache_is_bounded(app_factory):
    """An unbounded cache keyed by job id would grow with every service ever
    launched; the TTL cache has a hard entry ceiling."""
    from fileglancer.apps import serviceproxy
    assert serviceproxy._resolve_cache.maxsize == \
        serviceproxy._RESOLVE_CACHE_MAX_ENTRIES
    assert serviceproxy._resolve_cache.ttl == \
        serviceproxy._RESOLVE_CACHE_TTL_SECONDS
