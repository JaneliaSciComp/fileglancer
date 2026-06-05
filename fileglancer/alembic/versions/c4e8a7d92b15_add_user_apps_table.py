"""add user_apps table

Revision ID: c4e8a7d92b15
Revises: 20b763c28c4f
Create Date: 2026-05-24 00:00:00.000000

"""
from datetime import datetime, UTC

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4e8a7d92b15'
down_revision = '20b763c28c4f'
branch_labels = None
depends_on = None


def _parse_iso(value):
    """Parse an ISO 8601 timestamp string into a naive UTC datetime.

    Returns None if value is falsy or cannot be parsed.
    """
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(UTC).replace(tzinfo=None)
    return dt


def upgrade() -> None:
    op.create_table(
        'user_apps',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('url', sa.String(), nullable=False),
        sa.Column('manifest_path', sa.String(), nullable=False, server_default=''),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('branch', sa.String(), nullable=True),
        sa.Column('manifest', sa.JSON(), nullable=True),
        sa.Column('added_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('username', 'url', 'manifest_path', name='uq_user_app'),
    )
    op.create_index('ix_user_apps_username', 'user_apps', ['username'])

    # Data migration: move user_preferences['apps'] into user_apps rows.
    user_preferences = sa.table(
        'user_preferences',
        sa.column('id', sa.Integer),
        sa.column('username', sa.String),
        sa.column('key', sa.String),
        sa.column('value', sa.JSON),
    )
    user_apps = sa.table(
        'user_apps',
        sa.column('username', sa.String),
        sa.column('url', sa.String),
        sa.column('manifest_path', sa.String),
        sa.column('name', sa.String),
        sa.column('description', sa.String),
        sa.column('branch', sa.String),
        sa.column('manifest', sa.JSON),
        sa.column('added_at', sa.DateTime),
        sa.column('updated_at', sa.DateTime),
    )

    conn = op.get_bind()
    rows = conn.execute(
        sa.select(
            user_preferences.c.id,
            user_preferences.c.username,
            user_preferences.c.value,
        ).where(user_preferences.c.key == 'apps')
    ).fetchall()

    now = datetime.now(UTC).replace(tzinfo=None)
    seen: set[tuple[str, str, str]] = set()
    inserts = []
    for _pref_id, username, value in rows:
        app_list = (value or {}).get('apps', []) if isinstance(value, dict) else []
        for entry in app_list:
            if not isinstance(entry, dict):
                continue
            url = entry.get('url')
            if not url:
                continue
            manifest_path = entry.get('manifest_path') or ''
            key = (username, url, manifest_path)
            if key in seen:
                continue
            seen.add(key)
            inserts.append({
                'username': username,
                'url': url,
                'manifest_path': manifest_path,
                'name': entry.get('name') or 'Unknown',
                'description': entry.get('description'),
                'branch': None,
                'manifest': None,
                'added_at': _parse_iso(entry.get('added_at')) or now,
                'updated_at': _parse_iso(entry.get('updated_at')),
            })

    if inserts:
        conn.execute(user_apps.insert(), inserts)

    conn.execute(
        user_preferences.delete().where(user_preferences.c.key == 'apps')
    )


def downgrade() -> None:
    op.drop_index('ix_user_apps_username', table_name='user_apps')
    op.drop_table('user_apps')
