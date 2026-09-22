"""add views tables

Revision ID: 1e8dc304b4f2
Revises: e4d1b7a92c58
Create Date: 2026-08-07 10:59:17.090843

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1e8dc304b4f2'
down_revision = 'e4d1b7a92c58'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'views',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('short_key', sa.String(), nullable=False),
        sa.Column('read_key', sa.String(), nullable=False),
        sa.Column('edit_key', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('ng_state', sa.JSON(), nullable=False),
        sa.Column('sharing_mode', sa.String(), nullable=False, server_default='read'),
        sa.Column('owner', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('short_key', name='uq_views_short_key'),
        sa.UniqueConstraint('read_key', name='uq_views_read_key'),
        sa.UniqueConstraint('edit_key', name='uq_views_edit_key'),
    )
    op.create_index('ix_views_short_key', 'views', ['short_key'], unique=True)
    op.create_index('ix_views_read_key', 'views', ['read_key'], unique=True)
    op.create_index('ix_views_edit_key', 'views', ['edit_key'], unique=True)
    op.create_index('ix_views_owner', 'views', ['owner'])

    op.create_table(
        'view_layers',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('view_id', sa.Integer(), sa.ForeignKey('views.id'), nullable=False),
        sa.Column('data_link_id', sa.Integer(), sa.ForeignKey('proxied_paths.id'), nullable=True),
        sa.Column('layer_index', sa.Integer(), nullable=False),
        sa.Column('channel', sa.String(), nullable=True),
        sa.Column('opts', sa.JSON(), nullable=True),
        sa.Column('broken', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index('ix_view_layers_view_id', 'view_layers', ['view_id'])
    op.create_index('ix_view_layers_data_link_id', 'view_layers', ['data_link_id'])


def downgrade() -> None:
    op.drop_index('ix_view_layers_data_link_id', table_name='view_layers')
    op.drop_index('ix_view_layers_view_id', table_name='view_layers')
    op.drop_table('view_layers')
    op.drop_index('ix_views_owner', table_name='views')
    op.drop_index('ix_views_edit_key', table_name='views')
    op.drop_index('ix_views_read_key', table_name='views')
    op.drop_index('ix_views_short_key', table_name='views')
    op.drop_table('views')
