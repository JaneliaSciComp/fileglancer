/**
 * URL parsing/building helpers for app GitHub URLs.
 * Mirrors backend `_parse_github_url` logic.
 */

const GITHUB_URL_PATTERN =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/(.+?))?\/?$/;
// SSH forms: git@github.com:owner/repo(.git) and ssh://git@github.com/owner/repo(.git).
// SSH URLs don't carry a branch, so callers supply the revision separately.
const GITHUB_SSH_SCP_PATTERN =
  /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/;
const GITHUB_SSH_PROTO_PATTERN =
  /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

export function parseGithubUrl(url: string): {
  owner: string;
  repo: string;
  branch: string;
} {
  const trimmed = url.trim();
  const httpsMatch = trimmed.match(GITHUB_URL_PATTERN);
  if (httpsMatch) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2],
      branch: httpsMatch[3] || 'main'
    };
  }
  const sshMatch =
    trimmed.match(GITHUB_SSH_SCP_PATTERN) ??
    trimmed.match(GITHUB_SSH_PROTO_PATTERN);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2], branch: 'main' };
  }
  throw new Error(`Invalid GitHub URL: ${url}`);
}

/** "org/repo" label for an app's GitHub URL; falls back to the raw URL. */
export function repoLabel(url: string): string {
  try {
    const { owner, repo } = parseGithubUrl(url);
    return `${owner}/${repo}`;
  } catch {
    return url;
  }
}

/**
 * Normalize a GitHub URL to its canonical https form (no ".git" suffix, no
 * trailing slash, no redundant "/tree/main"). Returns the input unchanged if it
 * can't be parsed. Use this to compare URLs by repo identity rather than exact
 * string, since stored app URLs may carry any of those cosmetic variations.
 */
export function canonicalGithubUrl(url: string): string {
  try {
    const { owner, repo, branch } = parseGithubUrl(url);
    return buildGithubUrl(owner, repo, branch);
  } catch {
    return url;
  }
}

/** True if the string parses as a GitHub repo URL (HTTPS or SSH). */
export function isGithubRepoUrl(url: string): boolean {
  try {
    parseGithubUrl(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Combine a user-entered repo URL (HTTPS or SSH) and an optional revision into
 * a canonical https GitHub app URL. The revision overrides any branch in the
 * URL; when empty, the URL's own branch (or the default) is kept. Throws if the
 * repo URL can't be parsed.
 */
export function buildAppUrl(repoUrl: string, revision: string): string {
  const { owner, repo, branch } = parseGithubUrl(repoUrl);
  return buildGithubUrl(owner, repo, revision.trim() || branch);
}

export function buildGithubUrl(
  owner: string,
  repo: string,
  branch: string
): string {
  if (branch === 'main') {
    return `https://github.com/${owner}/${repo}`;
  }
  return `https://github.com/${owner}/${repo}/tree/${branch}`;
}

/**
 * Split a pasted GitHub URL that embeds a branch/tag (e.g.
 * `.../repo/tree/my-branch`) into the bare repo URL and the ref, so the ref can
 * be surfaced in a separate revision field. `ref` is empty when the URL carries
 * no ref (or the default `main`), or when the string isn't a parseable GitHub
 * URL — callers should only rewrite the input when `ref` is non-empty, leaving
 * bare and SSH URLs untouched.
 */
export function splitGithubRef(url: string): {
  repoUrl: string;
  ref: string;
} {
  try {
    const { owner, repo, branch } = parseGithubUrl(url);
    return {
      repoUrl: buildGithubUrl(owner, repo, 'main'),
      ref: branch === 'main' ? '' : branch
    };
  } catch {
    return { repoUrl: url, ref: '' };
  }
}

/** Revision label capped for tiles and table cells; full value goes in a tooltip. */
export function shortRevision(revision: string, max = 16): string {
  return revision.length > max ? `${revision.slice(0, max - 1)}…` : revision;
}

/**
 * The revision actually cloned, parsed out of the canonical app URL (which
 * always carries it). Falls back to the requested branch, then null.
 */
export function appRevision(
  appUrl: string,
  fallbackBranch?: string
): string | null {
  try {
    return parseGithubUrl(appUrl).branch;
  } catch {
    return fallbackBranch || null;
  }
}

/**
 * GitHub link for a specific commit of an app; null if the app URL isn't
 * parseable.
 */
export function buildGithubCommitUrl(
  appUrl: string,
  sha: string
): string | null {
  try {
    const { owner, repo } = parseGithubUrl(appUrl);
    return `https://github.com/${owner}/${repo}/commit/${sha}`;
  } catch {
    return null;
  }
}

const MANIFEST_FILENAME = 'runnables.yaml';

/**
 * The repo-relative file path and "./"-prefixed display label of an app's
 * manifest file, given the manifest path stored on an app or listing (a
 * directory path, "" for the repo root) and the manifest's source filename
 * (e.g. nextflow_schema.json or pixi.toml for auto-detected projects;
 * defaults to runnables.yaml when unknown).
 */
export function manifestPathInfo(
  path: string,
  sourceFilename?: string
): {
  filePath: string;
  label: string;
} {
  const filename = sourceFilename?.trim() || MANIFEST_FILENAME;
  const normalized = path
    .trim()
    .replace(/^\.?\//, '')
    .replace(/\/+$/, '');

  const filePath =
    !normalized || normalized === '.'
      ? filename
      : normalized === filename || normalized.endsWith(`/${filename}`)
        ? normalized
        : `${normalized}/${filename}`;

  return { filePath, label: `./${filePath}` };
}

/**
 * GitHub link for a file in an app repo at a specific revision. Falls back to
 * the revision encoded in the app URL when revision is not provided.
 */
export function buildGithubFileUrl(
  appUrl: string,
  revision: string | null | undefined,
  filePath: string
): string | null {
  try {
    const { owner, repo, branch } = parseGithubUrl(appUrl);
    const ref = revision?.trim() || branch;
    const normalizedPath = filePath
      .trim()
      .replace(/^\.?\//, '')
      .replace(/^\/+/, '');
    if (!ref || !normalizedPath) {
      return null;
    }
    const encodedPath = normalizedPath
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');
    return `https://github.com/${owner}/${repo}/blob/${ref}/${encodedPath}`;
  } catch {
    return null;
  }
}

export function buildLaunchPath(
  owner: string,
  repo: string,
  branch: string,
  entryPointId?: string,
  manifestPath?: string
): string {
  const params = new URLSearchParams();
  if (branch && branch !== 'main') {
    params.set('branch', branch);
  }
  if (entryPointId) {
    params.set('entryPointId', entryPointId);
  }
  if (manifestPath) {
    params.set('path', manifestPath);
  }
  const query = params.toString();
  return `/apps/launch/${owner}/${repo}${query ? `?${query}` : ''}`;
}

export function buildLaunchPathFromApp(
  appUrl: string,
  manifestPath: string,
  entryPointId?: string
): string {
  const { owner, repo, branch } = parseGithubUrl(appUrl);
  return buildLaunchPath(
    owner,
    repo,
    branch,
    entryPointId,
    manifestPath || undefined
  );
}

export function buildAppDetailPath(
  appUrl: string,
  manifestPath: string
): string {
  const { owner, repo, branch } = parseGithubUrl(appUrl);
  const params = new URLSearchParams();
  if (branch && branch !== 'main') {
    params.set('branch', branch);
  }
  if (manifestPath) {
    params.set('path', manifestPath);
  }
  const query = params.toString();
  return `/apps/detail/${owner}/${repo}${query ? `?${query}` : ''}`;
}

export function buildRelaunchPath(
  owner: string,
  repo: string,
  branch: string,
  entryPointId: string,
  manifestPath?: string
): string {
  const params = new URLSearchParams();
  if (branch && branch !== 'main') {
    params.set('branch', branch);
  }
  params.set('entryPointId', entryPointId);
  if (manifestPath) {
    params.set('path', manifestPath);
  }
  return `/apps/relaunch/${owner}/${repo}?${params.toString()}`;
}
