"""add cloud_buckets table

Revision ID: b2c7d9e4f1a8
Revises: c5b8e2f47a13
Create Date: 2026-10-24 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b2c7d9e4f1a8'
down_revision = 'c5b8e2f47a13'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'cloud_buckets',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('protocol', sa.String(), nullable=False),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('bucket', sa.String(), nullable=False),
        sa.Column('prefix', sa.String(), server_default='', nullable=False),
        sa.Column('endpoint_url', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username', 'name', name='uq_cloud_bucket_name'),
    )
    op.create_index('ix_cloud_buckets_username', 'cloud_buckets', ['username'])


def downgrade() -> None:
    op.drop_index('ix_cloud_buckets_username', table_name='cloud_buckets')
    op.drop_table('cloud_buckets')
