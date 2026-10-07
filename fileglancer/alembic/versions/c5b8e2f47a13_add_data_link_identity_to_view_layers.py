"""add sharing_key and url_prefix to view_layers

Revision ID: c5b8e2f47a13
Revises: 7c3e9a2d5b41
Create Date: 2026-09-29 10:00:00.000000

"""
import json
import os
import re
from urllib.parse import quote

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c5b8e2f47a13'
down_revision = '7c3e9a2d5b41'
branch_labels = None
depends_on = None


def _source_urls(source):
    if isinstance(source, str):
        yield source
    elif isinstance(source, dict) and isinstance(source.get('url'), str):
        yield source['url']
    elif isinstance(source, list):
        for item in source:
            yield from _source_urls(item)


def _backfill_broken(conn):
    """Broken rows kept fsp_name/path (7c3e9a2d5b41) but not the dead key.
    No View has been edited before this migration, so layer_index still points
    at the row's NG layer: guess the default url_prefix and look for
    /{key}/{prefix} in that layer's sources. Custom prefixes stay NULL
    (not relinkable). Self-contained: no app imports."""
    rows = conn.execute(sa.text(
        "SELECT vl.id, vl.layer_index, vl.fsp_name, vl.path, v.ng_state "
        "FROM view_layers vl JOIN views v ON v.id = vl.view_id "
        "WHERE vl.broken = :t AND vl.sharing_key IS NULL "
        "AND vl.fsp_name IS NOT NULL AND vl.path IS NOT NULL"
    ), {"t": True}).fetchall()
    for row in rows:
        state = json.loads(row.ng_state) if isinstance(row.ng_state, str) else (row.ng_state or {})
        layers = state.get('layers') or []
        if row.layer_index >= len(layers) or not isinstance(layers[row.layer_index], dict):
            continue
        url_prefix = quote(os.path.basename(row.path) or row.fsp_name, safe='/')
        pattern = re.compile(r'/([A-Za-z0-9_-]+)' + re.escape('/' + quote(url_prefix, safe='/')) + r'(?=[/|?#]|$)')
        for url in _source_urls(layers[row.layer_index].get('source')):
            match = pattern.search(url)
            if match:
                conn.execute(sa.text(
                    "UPDATE view_layers SET sharing_key = :k, url_prefix = :p WHERE id = :id"
                ), {"k": match.group(1), "p": url_prefix, "id": row.id})
                break


def upgrade() -> None:
    op.add_column('view_layers', sa.Column('sharing_key', sa.String(), nullable=True))
    op.add_column('view_layers', sa.Column('url_prefix', sa.String(), nullable=True))
    op.execute(
        """
        UPDATE view_layers
        SET sharing_key = (SELECT sharing_key FROM proxied_paths WHERE proxied_paths.id = view_layers.data_link_id),
            url_prefix  = (SELECT url_prefix  FROM proxied_paths WHERE proxied_paths.id = view_layers.data_link_id)
        WHERE data_link_id IS NOT NULL
        """
    )
    _backfill_broken(op.get_bind())


def downgrade() -> None:
    op.drop_column('view_layers', 'url_prefix')
    op.drop_column('view_layers', 'sharing_key')
