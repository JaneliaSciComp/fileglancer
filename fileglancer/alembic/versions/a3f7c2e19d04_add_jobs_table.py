"""add jobs table

Revision ID: a3f7c2e19d04
Revises: 2d1f0e6b8c91
Create Date: 2026-02-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3f7c2e19d04'
down_revision = '2d1f0e6b8c91'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'jobs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('cluster_job_id', sa.String(), nullable=True),
        sa.Column('app_url', sa.String(), nullable=False),
        sa.Column('app_name', sa.String(), nullable=False),
        sa.Column('manifest_path', sa.String(), nullable=False, server_default=''),
        sa.Column('entry_point_id', sa.String(), nullable=False),
        sa.Column('entry_point_name', sa.String(), nullable=False),
        sa.Column('parameters', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('exit_code', sa.Integer(), nullable=True),
        sa.Column('resources', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_jobs_username', 'jobs', ['username'])
    op.create_index('ix_jobs_cluster_job_id', 'jobs', ['cluster_job_id'])


def downgrade() -> None:
    op.drop_index('ix_jobs_cluster_job_id', table_name='jobs')
    op.drop_index('ix_jobs_username', table_name='jobs')
    op.drop_table('jobs')
