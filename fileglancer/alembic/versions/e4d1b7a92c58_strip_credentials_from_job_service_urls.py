"""strip credentials from stored job service URLs

jobs.service_url held the whole published URL, and its query string carries the
service's own access token. Nothing ever read that back: the column's only
consumer is /api/apps/resolve, which keeps the authority and discards the rest.
Rewrite existing rows to scheme://host:port so tokens already stored do not
outlive the fix, nulling any row with no usable authority -- the next
job-detail load repopulates it. Mirrors
fileglancer.apps.serviceproxy.service_url_origin, inlined here so the migration
stays self-contained.

Revision ID: e4d1b7a92c58
Revises: a9c3e05f1b47
Create Date: 2026-09-08 00:00:00.000000

"""
from urllib.parse import urlsplit, urlunsplit

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e4d1b7a92c58'
down_revision = 'a9c3e05f1b47'
branch_labels = None
depends_on = None


def _origin(service_url):
    if not service_url:
        return None
    try:
        parts = urlsplit(service_url)
    except ValueError:
        return None
    if not parts.scheme or not parts.netloc or '@' in parts.netloc:
        return None
    return urlunsplit((parts.scheme, parts.netloc, '', '', ''))


def _strip_stored_credentials(conn):
    rows = conn.execute(sa.text(
        "SELECT id, service_url FROM jobs WHERE service_url IS NOT NULL"
    )).fetchall()
    for r in rows:
        origin = _origin(r.service_url)
        if origin != r.service_url:
            conn.execute(
                sa.text("UPDATE jobs SET service_url = :url WHERE id = :id"),
                {"url": origin, "id": r.id},
            )


def upgrade() -> None:
    _strip_stored_credentials(op.get_bind())


def downgrade() -> None:
    # The discarded query string is where the token lived, so there is nothing
    # to put back. A running service repopulates the row on its next detail load.
    pass
