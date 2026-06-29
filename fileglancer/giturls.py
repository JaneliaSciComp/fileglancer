"""GitHub URL parsing and canonicalization.

Standalone (no fileglancer imports) so both the apps module and the database
layer can use it without an import cycle. Mirrors the frontend helpers in
frontend/src/utils/appUrls.ts.
"""

import re

_HTTPS_GITHUB_RE = r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/tree/(.+?))?/?$"
# scp-style (git@github.com:owner/repo.git) and ssh:// forms. SSH URLs don't
# carry a branch (no /tree/...), so branch is always None for them.
_SSH_SCP_GITHUB_RE = r"git@github\.com:([^/]+)/([^/]+?)(?:\.git)?/?$"
_SSH_PROTO_GITHUB_RE = r"ssh://git@github\.com/([^/]+)/([^/]+?)(?:\.git)?/?$"


def _parse_github_url(url: str) -> tuple[str, str, str | None]:
    """Parse a GitHub repo URL into (owner, repo, branch).

    Accepts HTTPS (https://github.com/owner/repo[/tree/branch]) and SSH
    (git@github.com:owner/repo.git or ssh://git@github.com/owner/repo) forms.
    Branch is None when not specified in the URL (always None for SSH forms).
    Raises ValueError if not a valid GitHub repo URL.
    """
    branch: str | None = None
    match = re.match(_HTTPS_GITHUB_RE, url)
    if match:
        owner, repo, branch = match.groups()
    else:
        match = re.match(_SSH_SCP_GITHUB_RE, url) or re.match(_SSH_PROTO_GITHUB_RE, url)
        if not match:
            raise ValueError(
                f"Invalid app URL: '{url}'. Only GitHub repository URLs are supported "
                f"(e.g., https://github.com/owner/repo or git@github.com:owner/repo.git)."
            )
        owner, repo = match.group(1), match.group(2)

    # Validate segments to prevent path traversal
    for name, value in [("owner", owner), ("repo", repo)]:
        if ".." in value or "\x00" in value:
            raise ValueError(
                f"Invalid app URL: {name} '{value}' contains invalid characters"
            )
    if branch and (
        ".." in branch
        or "\x00" in branch
        or branch.startswith("/")
        or branch.endswith("/")
        or "//" in branch
    ):
        raise ValueError(
            f"Invalid app URL: branch '{branch}' contains invalid characters"
        )

    return owner, repo, branch


def canonical_github_url(url: str) -> str:
    """Normalize a GitHub URL to its canonical https form.

    Strips a ".git" suffix and trailing slash, folds SSH forms to https, and
    treats "/tree/main" as the bare repo URL — so the same repo has one stored
    representation. Any other branch is kept as "/tree/<branch>".

    Note the "main" folding is shorthand for "the default branch", which is only
    accurate for repos whose default actually is "main": a bare URL means "the
    default branch" while "/tree/main" means the main branch specifically, so for
    a repo defaulting to e.g. "master" these are different refs that this
    collapses together. Callers that need the real cloned revision in the URL
    resolve the default branch first (see resolve_app_url) rather than relying on
    this. The frontend's buildGithubUrl/canonicalGithubUrl fold "main" the same
    way, and the "is it installed?" comparison depends on both sides matching.

    Returns the input unchanged if it isn't a parseable GitHub URL.
    """
    try:
        owner, repo, branch = _parse_github_url(url)
    except ValueError:
        return url
    if branch and branch != "main":
        return f"https://github.com/{owner}/{repo}/tree/{branch}"
    return f"https://github.com/{owner}/{repo}"


def github_url_at_branch(owner: str, repo: str, branch: str) -> str:
    """Build the canonical https URL for owner/repo at a specific branch.

    The default branch "main" folds away (a bare repo URL implies it), so a
    non-default branch like "master" stays explicit as "/tree/master". Use this
    to bake a *resolved* revision into a stored app URL.
    """
    return canonical_github_url(f"https://github.com/{owner}/{repo}/tree/{branch}")
