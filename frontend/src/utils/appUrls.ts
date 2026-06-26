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
