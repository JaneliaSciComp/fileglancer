"""Tests for the c1f9a4e7b2d8 "bake revision into app URLs" migration."""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from fileglancer.database import Base


_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "fileglancer" / "alembic" / "versions"
    / "c1f9a4e7b2d8_bake_revision_into_app_urls.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("_rev_mig", _MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


mig = _load_migration()


class _Row:
    def __init__(self, url, branch):
        self.url = url
        self.branch = branch


@pytest.mark.parametrize(
    "url,branch,expected_url,expected_requested",
    [
        # Bare URL, default resolved to main -> stays bare, unpinned.
        ("https://github.com/o/r", "main", "https://github.com/o/r", ""),
        # Bare URL, default resolved to master -> revision baked in, unpinned.
        ("https://github.com/o/r", "master", "https://github.com/o/r/tree/master", ""),
        # Explicitly pinned branch -> URL unchanged, requested recorded.
        ("https://github.com/o/r/tree/dev", "dev", "https://github.com/o/r/tree/dev", "dev"),
        # Defensive: missing branch column falls back to the URL/main.
        ("https://github.com/o/r", None, "https://github.com/o/r", ""),
    ],
)
def test_target(url, branch, expected_url, expected_requested):
    assert mig._target(_Row(url, branch)) == (expected_url, expected_requested)


def test_target_unparseable_left_alone():
    assert mig._target(_Row("not a url", "main")) is None


@pytest.fixture
def engine():
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


def test_bakes_resolved_revision_and_flips_branch(engine):
    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO user_apps (username, url, branch, manifest_path, name, added_at) "
            "VALUES "
            # bare URL whose default was master -> bake /tree/master, unpinned
            "('bob', 'https://github.com/o/master_repo', 'master', '', 'm', '2026-01-01'),"
            # bare URL whose default was main -> stays bare, unpinned
            "('bob', 'https://github.com/o/main_repo', 'main', '', 'n', '2026-01-01'),"
            # explicit pin -> URL kept, branch records the pin
            "('bob', 'https://github.com/o/pinned/tree/dev', 'dev', '', 'p', '2026-01-01')"
        ))

    with engine.begin() as conn:
        mig._migrate_unique_table(conn, "user_apps", "username")

    with engine.begin() as conn:
        rows = conn.execute(text(
            "SELECT name, url, branch FROM user_apps ORDER BY name"
        )).fetchall()

    by_name = {r.name: (r.url, r.branch) for r in rows}
    assert by_name["m"] == ("https://github.com/o/master_repo/tree/master", "")
    assert by_name["n"] == ("https://github.com/o/main_repo", "")
    assert by_name["p"] == ("https://github.com/o/pinned/tree/dev", "dev")


def test_dedupes_bare_against_explicit_revision(engine):
    """A bare master-default row collapses onto an explicit /tree/master row."""
    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO user_apps (username, url, branch, manifest_path, name, added_at) "
            "VALUES "
            # already-baked explicit row (the winner)
            "('bob', 'https://github.com/o/r/tree/master', 'master', '', 'canon', '2026-01-01'),"
            # bare row that bakes to the same canonical URL -> dropped
            "('bob', 'https://github.com/o/r', 'master', '', 'dup', '2026-01-01')"
        ))

    with engine.begin() as conn:
        mig._migrate_unique_table(conn, "user_apps", "username")

    with engine.begin() as conn:
        rows = conn.execute(text(
            "SELECT name, url, branch FROM user_apps ORDER BY name"
        )).fetchall()

    by_name = {r.name: (r.url, r.branch) for r in rows}
    assert "dup" not in by_name
    assert by_name["canon"] == ("https://github.com/o/r/tree/master", "master")
