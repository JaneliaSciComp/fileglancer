"""add container and container_args columns

Revision ID: 483b2e31b85e
Revises: b5e8a3f21c76
Create Date: 2026-02-28 16:39:39.385514

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '483b2e31b85e'
down_revision = 'b5e8a3f21c76'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('jobs', sa.Column('container', sa.String(), nullable=True))
    op.add_column('jobs', sa.Column('container_args', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('jobs', 'container_args')
    op.drop_column('jobs', 'container')
