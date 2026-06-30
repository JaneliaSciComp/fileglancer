"""Tests for the b8e4f1a92c37 GitHub-URL canonicalization migration."""

import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from fileglancer.database import Base


_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "fileglancer" / "alembic" / "versions"
    / "b8e4f1a92c37_canonicalize_github_urls.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("_url_mig", _MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


mig = _load_migration()


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://github.com/Org/Repo", "https://github.com/Org/Repo"),
        ("https://github.com/Org/Repo.git", "https://github.com/Org/Repo"),
        ("https://github.com/Org/Repo/", "https://github.com/Org/Repo"),
        ("https://github.com/Org/Repo/tree/main", "https://github.com/Org/Repo"),
        ("git@github.com:Org/Repo.git", "https://github.com/Org/Repo"),
        ("https://github.com/Org/Repo/tree/dev", "https://github.com/Org/Repo/tree/dev"),
        ("not a url", "not a url"),
        (None, None),
    ],
)
def test_migration_canonical_matches_runtime(url, expected):
    from fileglancer.giturls import canonical_github_url

    assert mig._canonical(url) == expected
    if url is not None:
        # The migration's inlined copy must agree with the runtime helper.
        assert mig._canonical(url) == canonical_github_url(url)


@pytest.fixture
def engine():
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


def test_unique_table_canonicalizes_and_dedupes(engine):
    with engine.begin() as conn:
        # Two rows for the same user that collapse to one canonical URL (a
        # canonical row already exists), plus one standalone non-canonical row.
        conn.execute(text(
            "INSERT INTO user_apps (username, url, manifest_path, name, added_at) "
            "VALUES "
            "('bob', 'https://github.com/o/r', '', 'canon', '2026-01-01'),"
            "('bob', 'https://github.com/o/r.git', '', 'dup', '2026-01-01'),"
            "('bob', 'https://github.com/o/other.git', '', 'other', '2026-01-01')"
        ))

    with engine.begin() as conn:
        mig._canonicalize_unique_table(conn, "user_apps", "username")

    with engine.begin() as conn:
        rows = conn.execute(text(
            "SELECT name, url FROM user_apps ORDER BY name"
        )).fetchall()

    by_name = {r.name: r.url for r in rows}
    # The .git duplicate of an existing canonical row is dropped.
    assert "dup" not in by_name
    assert by_name["canon"] == "https://github.com/o/r"
    # The standalone non-canonical row is rewritten in place.
    assert by_name["other"] == "https://github.com/o/other"
