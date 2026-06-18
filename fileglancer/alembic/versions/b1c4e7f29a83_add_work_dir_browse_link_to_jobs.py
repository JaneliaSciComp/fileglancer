"""add work_dir browse-link columns to jobs

Revision ID: b1c4e7f29a83
Revises: f3a9c41d76e2
Create Date: 2026-06-18 00:00:00.000000

Stores the file-share-path name and subpath that the job's work directory
resolves to, computed once in the user-context worker at submit time. Lets the
job-detail endpoint build browse links from the DB without realpath'ing every
mount on each read (which triggered NFS automounts on a cold server).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b1c4e7f29a83'
down_revision = 'f3a9c41d76e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('jobs', sa.Column('work_dir_fsp_name', sa.String(), nullable=True))
    op.add_column('jobs', sa.Column('work_dir_subpath', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('jobs', 'work_dir_subpath')
    op.drop_column('jobs', 'work_dir_fsp_name')
