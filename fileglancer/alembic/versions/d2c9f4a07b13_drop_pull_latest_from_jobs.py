"""drop pull_latest column from jobs

Revision ID: d2c9f4a07b13
Revises: c4e8a7d92b15
Create Date: 2026-06-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd2c9f4a07b13'
down_revision = 'c4e8a7d92b15'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('jobs', 'pull_latest')


def downgrade() -> None:
    op.add_column(
        'jobs',
        sa.Column('pull_latest', sa.Boolean(), nullable=False, server_default='0'),
    )
