"""add app_listings table

Revision ID: d9f1a3c5e208
Revises: d2c9f4a07b13
Create Date: 2026-05-24 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd9f1a3c5e208'
down_revision = 'd2c9f4a07b13'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'app_listings',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('owner_username', sa.String(), nullable=False),
        sa.Column('url', sa.String(), nullable=False),
        sa.Column('manifest_path', sa.String(), nullable=False, server_default=''),
        sa.Column('branch', sa.String(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('published_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            'owner_username', 'url', 'manifest_path', name='uq_app_listing'
        ),
    )
    op.create_index(
        'ix_app_listings_owner_username', 'app_listings', ['owner_username']
    )


def downgrade() -> None:
    op.drop_index('ix_app_listings_owner_username', table_name='app_listings')
    op.drop_table('app_listings')
