"""add service_proxy opt-out to jobs

Revision ID: a9c3e05f1b47
Revises: c3e9b7f41a28
Create Date: 2026-09-04 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a9c3e05f1b47'
down_revision = 'c3e9b7f41a28'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Every existing job was eligible for the proxy, so a server default
    # backfills them rather than leaving a nullable column whose NULL would
    # have to mean "true" at every read site.
    op.add_column('jobs', sa.Column('service_proxy', sa.Boolean(),
                                    nullable=False,
                                    server_default=sa.true()))


def downgrade() -> None:
    op.drop_column('jobs', 'service_proxy')
