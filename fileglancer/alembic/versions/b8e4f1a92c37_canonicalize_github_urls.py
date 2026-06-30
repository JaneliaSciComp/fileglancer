"""canonicalize stored GitHub URLs

Normalizes app/listing/job GitHub URLs to a single canonical form (no ".git"
suffix, no trailing slash, no redundant "/tree/main"; SSH folded to https), so
that an app's URL matches consistently across the catalog, a user's library and
the launch page. Mirrors fileglancer.giturls.canonical_github_url, inlined here
so the migration stays self-contained.

Revision ID: b8e4f1a92c37
Revises: e1a7c93d04f5
Create Date: 2026-06-26 00:00:00.000000

"""
import re

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8e4f1a92c37'
down_revision = 'e1a7c93d04f5'
branch_labels = None
depends_on = None


_HTTPS_RE = re.compile(r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/tree/(.+?))?/?$")
_SSH_SCP_RE = re.compile(r"git@github\.com:([^/]+)/([^/]+?)(?:\.git)?/?$")
_SSH_PROTO_RE = re.compile(r"ssh://git@github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$")


def _canonical(url):
    if not url:
        return url
    m = _HTTPS_RE.match(url)
    if m:
        owner, repo, branch = m.group(1), m.group(2), m.group(3)
    else:
        m = _SSH_SCP_RE.match(url) or _SSH_PROTO_RE.match(url)
        if not m:
            return url
        owner, repo, branch = m.group(1), m.group(2), None
    if branch and branch != "main":
        return f"https://github.com/{owner}/{repo}/tree/{branch}"
    return f"https://github.com/{owner}/{repo}"


def _canonicalize_unique_table(conn, table, owner_col):
    """Canonicalize ``url`` for a table with a UNIQUE(owner, url, manifest_path)
    constraint. Rows that would collide with an existing canonical row are
    dropped (the canonical row wins) rather than triggering a constraint error."""
    rows = conn.execute(sa.text(
        f"SELECT id, {owner_col} AS owner, url, manifest_path FROM {table}"
    )).fetchall()

    # Pass 1: register rows already in canonical form so non-canonical rows that
    # map onto them are treated as duplicates.
    seen = {}
    for r in rows:
        if _canonical(r.url) == r.url:
            seen[(r.owner, r.url, r.manifest_path)] = r.id

    # Pass 2: rewrite the rest, deleting any that collide with a canonical row.
    for r in rows:
        canonical = _canonical(r.url)
        if canonical == r.url:
            continue
        key = (r.owner, canonical, r.manifest_path)
        if key in seen:
            conn.execute(sa.text(f"DELETE FROM {table} WHERE id = :id"),
                         {"id": r.id})
        else:
            conn.execute(sa.text(f"UPDATE {table} SET url = :url WHERE id = :id"),
                         {"url": canonical, "id": r.id})
            seen[key] = r.id


def upgrade() -> None:
    conn = op.get_bind()
    _canonicalize_unique_table(conn, "user_apps", "username")
    _canonicalize_unique_table(conn, "app_listings", "owner_username")

    # jobs has no uniqueness constraint on the URL; canonicalize in place.
    for r in conn.execute(sa.text("SELECT id, app_url FROM jobs")).fetchall():
        canonical = _canonical(r.app_url)
        if canonical != r.app_url:
            conn.execute(sa.text("UPDATE jobs SET app_url = :url WHERE id = :id"),
                         {"url": canonical, "id": r.id})


def downgrade() -> None:
    # Canonicalization is lossy (the original ".git"/trailing-slash/"/tree/main"
    # form can't be recovered), so there is nothing to undo.
    pass
