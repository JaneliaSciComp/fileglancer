"""add fsp_name and path to view_layers

Revision ID: 7c3e9a2d5b41
Revises: 1e8dc304b4f2
Create Date: 2026-09-16 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7c3e9a2d5b41'
down_revision = '1e8dc304b4f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('view_layers', sa.Column('fsp_name', sa.String(), nullable=True))
    op.add_column('view_layers', sa.Column('path', sa.String(), nullable=True))
    # Backfill from the still-linked Data Link. Correlated subqueries run on
    # both SQLite and Postgres. Layers already broken before this migration
    # have no link to copy from and stay NULL.
    op.execute(
        """
        UPDATE view_layers
        SET fsp_name = (SELECT fsp_name FROM proxied_paths WHERE proxied_paths.id = view_layers.data_link_id),
            path     = (SELECT path     FROM proxied_paths WHERE proxied_paths.id = view_layers.data_link_id)
        WHERE data_link_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column('view_layers', 'path')
    op.drop_column('view_layers', 'fsp_name')
