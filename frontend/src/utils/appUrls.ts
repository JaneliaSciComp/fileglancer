/**
 * URL parsing/building helpers for app GitHub URLs.
 * Mirrors backend `_parse_github_url` logic.
 */

const GITHUB_URL_PATTERN =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/(.+?))?\/?$/;

export function parseGithubUrl(url: string): {
  owner: string;
  repo: string;
  branch: string;
} {
  const match = url.match(GITHUB_URL_PATTERN);
  if (!match) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }
  return {
    owner: match[1],
    repo: match[2],
    branch: match[3] || 'main'
  };
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
