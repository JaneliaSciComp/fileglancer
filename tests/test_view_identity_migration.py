"""Test the c5b8e2f47a13 migration backfills view_layers Data Link identity."""

import importlib.util
import json
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from alembic.migration import MigrationContext
from alembic.operations import Operations

_MIGRATION = (
    Path(__file__).resolve().parent.parent
    / "fileglancer" / "alembic" / "versions"
    / "c5b8e2f47a13_add_data_link_identity_to_view_layers.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("_identity_mig", _MIGRATION)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


mig = _load_migration()
P = "http://localhost/files"


@pytest.fixture
def engine():
    eng = create_engine("sqlite://")
    yield eng
    eng.dispose()


def test_backfills_live_and_default_prefix_broken_rows(engine):
    state = {"layers": [
        {"name": "live", "source": f"{P}/LIVEKEY/live.zarr|zarr2:"},
        {"name": "dead", "source": f"{P}/DEADKEY/two.zarr|zarr2:"},
        {"name": "custom", "source": f"{P}/DEAD2/my/custom|zarr2:"},
    ]}
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE proxied_paths (id INTEGER PRIMARY KEY, sharing_key TEXT, url_prefix TEXT)"))
        conn.execute(text("CREATE TABLE views (id INTEGER PRIMARY KEY, ng_state TEXT)"))
        conn.execute(text(
            "CREATE TABLE view_layers (id INTEGER PRIMARY KEY, view_id INTEGER, data_link_id INTEGER, "
            "layer_index INTEGER, fsp_name TEXT, path TEXT, broken BOOLEAN)"))
        conn.execute(text("INSERT INTO proxied_paths VALUES (1, 'LIVEKEY', 'live.zarr')"))
        conn.execute(text("INSERT INTO views VALUES (1, :s)"), {"s": json.dumps(state)})
        conn.execute(text(
            "INSERT INTO view_layers VALUES "
            "(1, 1, 1, 0, 'nrs', 'a/live.zarr', 0), "
            "(2, 1, NULL, 1, 'nrs', 'b/two.zarr', 1), "
            "(3, 1, NULL, 2, 'nrs', 'c/three.zarr', 1), "
            "(4, 1, NULL, 3, NULL, NULL, 1)"))

    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            mig.upgrade()

    with engine.begin() as conn:
        rows = {r.id: r for r in conn.execute(text(
            "SELECT id, sharing_key, url_prefix FROM view_layers")).fetchall()}

    assert (rows[1].sharing_key, rows[1].url_prefix) == ("LIVEKEY", "live.zarr")
    assert (rows[2].sharing_key, rows[2].url_prefix) == ("DEADKEY", "two.zarr")
    # custom prefix doesn't match the default guess -> not recoverable
    assert (rows[3].sharing_key, rows[3].url_prefix) == (None, None)
    # pre-08 broken row with no source at all
    assert (rows[4].sharing_key, rows[4].url_prefix) == (None, None)
