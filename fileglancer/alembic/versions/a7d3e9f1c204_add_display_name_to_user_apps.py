"""add display_name column to user_apps

Revision ID: a7d3e9f1c204
Revises: b2c7d9e4f1a8
Create Date: 2026-10-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a7d3e9f1c204'
down_revision = 'b2c7d9e4f1a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('user_apps', sa.Column('display_name', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('user_apps', 'display_name')
