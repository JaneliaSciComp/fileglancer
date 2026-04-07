"""add is_transparent to proxied_paths

Revision ID: 76858c70bde5
Revises: a3d7cc6e95e8
Create Date: 2026-04-07 14:27:21.377139

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '76858c70bde5'
down_revision = 'a3d7cc6e95e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('proxied_paths', sa.Column('is_transparent', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('proxied_paths', 'is_transparent')