"""add neuroglancer_links table

Revision ID: a1b2c3d4e5f6
Revises: 9812335c52b6
Create Date: 2025-12-19 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '9812335c52b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('neuroglancer_links',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('short_key', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('ng_url_base', sa.String(), nullable=False),
        sa.Column('state_json', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_neuroglancer_links_username', 'neuroglancer_links', ['username'], unique=False)
    op.create_index('ix_neuroglancer_links_short_key', 'neuroglancer_links', ['short_key'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_neuroglancer_links_short_key', table_name='neuroglancer_links')
    op.drop_index('ix_neuroglancer_links_username', table_name='neuroglancer_links')
    op.drop_table('neuroglancer_links')
