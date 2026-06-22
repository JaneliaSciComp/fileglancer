"""add env_parameters column to jobs

Revision ID: e1a7c93d04f5
Revises: c7d2f4a9e103
Create Date: 2026-06-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e1a7c93d04f5'
down_revision = 'c7d2f4a9e103'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('jobs', sa.Column('env_parameters', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('jobs', 'env_parameters')
