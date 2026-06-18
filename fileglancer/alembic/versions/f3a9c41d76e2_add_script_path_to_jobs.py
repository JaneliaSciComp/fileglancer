"""add script_path column to jobs

Revision ID: f3a9c41d76e2
Revises: d9f1a3c5e208
Create Date: 2026-06-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f3a9c41d76e2'
down_revision = 'd9f1a3c5e208'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('jobs', sa.Column('script_path', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('jobs', 'script_path')
