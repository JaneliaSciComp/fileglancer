"""add entry_point_type to jobs

Revision ID: b5e8a3f21c76
Revises: a3f7c2e19d04
Create Date: 2026-02-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b5e8a3f21c76'
down_revision = 'a3f7c2e19d04'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('jobs', sa.Column('entry_point_type', sa.String(), nullable=False, server_default='job'))


def downgrade() -> None:
    op.drop_column('jobs', 'entry_point_type')
