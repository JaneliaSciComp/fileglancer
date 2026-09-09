"""Tests for the e4d1b7a92c58 service-URL credential-stripping migration."""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from fileglancer.database import Base


_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "fileglancer" / "alembic" / "versions"
    / "e4d1b7a92c58_strip_credentials_from_job_service_urls.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("_svc_url_mig", _MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


mig = _load_migration()


@pytest.mark.parametrize("url", [
    "http://node01:41235/lab?token=abc",
    "http://node01:41235",
    "https://node01:8443/x?a=1#f",
    "https://user:pw@node01:8443/x",
    "garbage",
    "",
    None,
])
def test_migration_origin_matches_runtime(url):
    """The inlined copy must agree with the helper the app writes through."""
    from fileglancer.apps.serviceproxy import service_url_origin

    assert mig._origin(url) == service_url_origin(url)


@pytest.fixture
def engine():
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


def _seed(engine, rows):
    """Insert {job_id: service_url} through the ORM, so the model's own
    defaults (status, created_at) are applied rather than hand-written."""
    from sqlalchemy.orm import Session

    from fileglancer.database import JobDB

    with Session(engine) as session:
        for job_id, service_url in rows.items():
            session.add(JobDB(
                id=job_id, username="alice", app_name="demo",
                app_url="https://github.com/org/demo", entry_point_id="run",
                entry_point_name="Run", parameters={}, status="RUNNING",
                service_url=service_url,
            ))
        session.commit()


def _service_urls(conn):
    return dict(conn.execute(
        text("SELECT id, service_url FROM jobs ORDER BY id")).fetchall())


def test_upgrade_strips_the_token_and_nulls_unusable_rows(engine):
    _seed(engine, {
        1: "http://node01:41235/lab?token=abc",
        2: "http://node02:8080",
        3: "garbage",
        4: "https://user:pw@node03:8443/x",
        5: None,
    })
    with engine.begin() as conn:
        mig._strip_stored_credentials(conn)

        assert _service_urls(conn) == {
            1: "http://node01:41235",   # token dropped
            2: "http://node02:8080",    # already an origin, untouched
            3: None,                    # no authority to keep
            4: None,                    # userinfo is a credential too
            5: None,
        }


def test_upgrade_is_idempotent(engine):
    _seed(engine, {1: "http://node01:41235/lab?token=abc"})
    with engine.begin() as conn:
        mig._strip_stored_credentials(conn)
        first = _service_urls(conn)
        mig._strip_stored_credentials(conn)
        assert _service_urls(conn) == first


def test_stripped_row_still_resolves_to_the_same_upstream(engine):
    """The migration must not break a running service's proxy resolution."""
    from fileglancer.apps.serviceproxy import upstream_from_service_url

    _seed(engine, {1: "http://node01:41235/lab?token=abc"})
    with engine.begin() as conn:
        mig._strip_stored_credentials(conn)
        stored = _service_urls(conn)[1]

    assert upstream_from_service_url(stored) == "node01:41235"
