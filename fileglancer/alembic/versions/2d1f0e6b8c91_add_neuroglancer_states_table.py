"""add neuroglancer_states table

Revision ID: 2d1f0e6b8c91
Revises: 9812335c52b6
Create Date: 2025-10-22 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2d1f0e6b8c91'
down_revision = '9812335c52b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'neuroglancer_states',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('short_key', sa.String(), nullable=False),
        sa.Column('short_name', sa.String(), nullable=True),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('url_base', sa.String(), nullable=False),
        sa.Column('state', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('short_key', name='uq_neuroglancer_states_short_key')
    )
    op.create_index(
        'ix_neuroglancer_states_short_key',
        'neuroglancer_states',
        ['short_key'],
        unique=True
    )


def downgrade() -> None:
    op.drop_index('ix_neuroglancer_states_short_key', table_name='neuroglancer_states')
    op.drop_table('neuroglancer_states')
