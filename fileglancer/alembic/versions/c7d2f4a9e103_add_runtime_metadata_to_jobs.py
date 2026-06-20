"""add command, conda_env, requirements columns to jobs

Revision ID: c7d2f4a9e103
Revises: b1c4e7f29a83
Create Date: 2026-06-18 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c7d2f4a9e103'
down_revision = 'b1c4e7f29a83'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('jobs', sa.Column('command', sa.String(), nullable=True))
    op.add_column('jobs', sa.Column('conda_env', sa.String(), nullable=True))
    op.add_column('jobs', sa.Column('requirements', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('jobs', 'requirements')
    op.drop_column('jobs', 'conda_env')
    op.drop_column('jobs', 'command')
