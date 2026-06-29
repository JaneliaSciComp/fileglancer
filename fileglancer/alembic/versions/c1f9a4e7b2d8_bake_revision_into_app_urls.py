"""bake the cloned revision into app URLs

Rewrites stored app/listing URLs so the canonical URL always carries the
revision actually cloned (e.g. ".../tree/master" for a repo whose default is
"master"; "main" still folds to the bare URL). The ``branch`` column flips to
mean the *requested* revision — "" when the app was added from a bare URL. The
revision is fixed at migration/add time; a bare stored URL means the fixed
"main" revision, not "whatever the default branch is now".

Before this migration ``branch`` held the resolved revision and the bare/master
ambiguity meant a bare URL and an explicit "/tree/master" were stored as two
different rows for the same app. Baking the resolved revision into the URL
closes that gap, so colliding rows are de-duplicated here (the canonical row
wins), mirroring b8e4f1a92c37.

The requested revision is recovered from the URL's shape: a stored "/tree/<x>"
was an explicit pin (requested = x), while a bare URL was unpinned
(requested = "").

Rows whose ``branch`` is NULL are legacy entries migrated from
user_preferences whose resolved default was never recorded. We can't resolve it
here (no network), and assuming "main" would break a repo defaulting to e.g.
"master", so those rows are left untouched and keep tracking the default branch
until they are re-added. jobs carry no branch column and are historical, so
they are left untouched too.

Revision ID: c1f9a4e7b2d8
Revises: b8e4f1a92c37
Create Date: 2026-06-29 00:00:00.000000

"""
import re

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c1f9a4e7b2d8'
down_revision = 'b8e4f1a92c37'
branch_labels = None
depends_on = None


_HTTPS_RE = re.compile(r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/tree/(.+?))?/?$")
_SSH_SCP_RE = re.compile(r"git@github\.com:([^/]+)/([^/]+?)(?:\.git)?/?$")
_SSH_PROTO_RE = re.compile(r"ssh://git@github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$")


def _parse(url):
    """Return (owner, repo, branch) or None if not a parseable GitHub URL."""
    if not url:
        return None
    m = _HTTPS_RE.match(url)
    if m:
        return m.group(1), m.group(2), m.group(3)
    m = _SSH_SCP_RE.match(url) or _SSH_PROTO_RE.match(url)
    if m:
        return m.group(1), m.group(2), None
    return None


def _at_branch(owner, repo, branch):
    """Canonical URL for owner/repo at branch ("main" folds to the bare URL)."""
    if branch and branch != "main":
        return f"https://github.com/{owner}/{repo}/tree/{branch}"
    return f"https://github.com/{owner}/{repo}"


def _target(row):
    """Return (new_url, requested_branch) for a row, or None to leave it alone.

    A NULL branch is a legacy row (migrated from user_preferences) whose resolved
    default was never recorded. We can't resolve it here without network, and
    assuming "main" would break a repo defaulting to e.g. "master". Leave such
    rows untouched (branch stays NULL) so they keep tracking the default until
    re-added; only rows with a known resolved revision are rewritten.
    """
    if row.branch is None:
        return None
    parsed = _parse(row.url)
    if parsed is None:
        return None
    owner, repo, url_branch = parsed
    requested = url_branch or ""
    resolved = row.branch or url_branch or "main"
    return _at_branch(owner, repo, resolved), requested


def _migrate_unique_table(conn, table, owner_col):
    """Bake the resolved revision into ``url`` and set ``branch`` to the
    requested revision, for a table with UNIQUE(owner, url, manifest_path).
    Rows whose new URL collides with another row are dropped (canonical wins)."""
    rows = conn.execute(sa.text(
        f"SELECT id, {owner_col} AS owner, url, branch, manifest_path FROM {table}"
    )).fetchall()

    targets = {r.id: _target(r) for r in rows}

    # Pass 1: rows that will remain at their current URL are the winners on
    # collision. This includes NULL-branch legacy rows (target is None): they are
    # deliberately left untouched, so another row that bakes to their URL must be
    # dropped instead of violating the table's UNIQUE(owner, url, manifest_path)
    # constraint.
    seen = {}
    for r in rows:
        t = targets[r.id]
        if t is None:
            seen[(r.owner, r.url, r.manifest_path)] = r.id
        elif t[0] == r.url:
            seen[(r.owner, t[0], r.manifest_path)] = r.id

    # Pass 2: rewrite the rest, dropping any that collide with a claimed URL.
    for r in rows:
        t = targets[r.id]
        if t is None:
            continue
        new_url, requested = t
        key = (r.owner, new_url, r.manifest_path)
        if new_url != r.url and key in seen:
            conn.execute(sa.text(f"DELETE FROM {table} WHERE id = :id"),
                         {"id": r.id})
            continue
        conn.execute(
            sa.text(f"UPDATE {table} SET url = :url, branch = :branch WHERE id = :id"),
            {"url": new_url, "branch": requested, "id": r.id},
        )
        seen[key] = r.id


def upgrade() -> None:
    conn = op.get_bind()
    _migrate_unique_table(conn, "user_apps", "username")
    _migrate_unique_table(conn, "app_listings", "owner_username")


def downgrade() -> None:
    # Recovering the pre-migration url/branch split would require re-resolving
    # each repo's default branch over the network, so there is nothing to undo.
    pass
