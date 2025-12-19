"""add short_name to neuroglancer_states

Revision ID: 3c5b7a9f2c11
Revises: 2d1f0e6b8c91
Create Date: 2025-10-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3c5b7a9f2c11'
down_revision = '2d1f0e6b8c91'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('neuroglancer_states', sa.Column('short_name', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('neuroglancer_states', 'short_name')
