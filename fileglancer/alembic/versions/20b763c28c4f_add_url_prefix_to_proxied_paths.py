"""add url_prefix to proxied_paths

Revision ID: 20b763c28c4f
Revises: a3d7cc6e95e8
Create Date: 2026-04-09 16:11:10.155619

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20b763c28c4f'
down_revision = 'a3d7cc6e95e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('proxied_paths', sa.Column('url_prefix', sa.String(), server_default='', nullable=False))
    # Backfill: set url_prefix to basename of path for existing rows
    proxied_paths = sa.table('proxied_paths', sa.column('path', sa.String), sa.column('url_prefix', sa.String))
    conn = op.get_bind()
    rows = conn.execute(sa.select(proxied_paths.c.path).distinct()).fetchall()
    for (path,) in rows:
        basename = path.rsplit('/', 1)[-1] if '/' in path else path
        conn.execute(
            proxied_paths.update()
            .where(proxied_paths.c.path == path)
            .values(url_prefix=basename)
        )


def downgrade() -> None:
    op.drop_column('proxied_paths', 'url_prefix')