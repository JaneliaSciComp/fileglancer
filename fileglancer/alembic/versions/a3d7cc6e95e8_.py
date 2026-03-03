"""add work_dir column to jobs

Revision ID: a3d7cc6e95e8
Revises: 483b2e31b85e
Create Date: 2026-03-01 11:23:18.528439

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3d7cc6e95e8'
down_revision = '483b2e31b85e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('jobs', sa.Column('work_dir', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('jobs', 'work_dir')
