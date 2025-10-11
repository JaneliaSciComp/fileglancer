import path from 'path';
import type { FileSharePath } from '@/shared.types';

const PATH_DELIMITER = '/';

/**
 * Escapes path segments for safe inclusion in URLs while preserving forward slashes as path separators.
 * This prevents issues with special characters like percentage signs breaking URL parsing.
 *
 * Examples:
 * escapePathForUrl('file with spaces.txt') // Returns 'file%20with%20spaces.txt'
 * escapePathForUrl('path/with%signs/file.txt') // Returns 'path/with%25signs/file.txt'
 * escapePathForUrl('folder/subfolder/file 100%.txt') // Returns 'folder/subfolder/file%20100%25.txt'
 */
function escapePathForUrl(path: string): string {
  if (!path) {
    return path;
  }

  // Split by forward slashes to preserve path separators
  return path
    .split('/')
    .map(segment => {
      // Don't escape empty segments (preserves leading/trailing slashes and double slashes)
      if (segment === '') {
        return segment;
      }
      return encodeURIComponent(segment);
    })
    .join('/');
}

/**
 * Remove any trailing slashes from a path
 * Only for use in normalzing all styles of mount path on initial data load
 * E.g.:
 * removeTrailingSlashes('/path/to/folder/'); // Returns '/path/to/folder
 * removeTrailingSlashes('smb://path/to/folder/'); // Returns 'smb://path/to/folder'
 * removeTrailingSlashes('\\prfs.hhmi.org\\path\\to\\folder\\'); // Returns '\\prfs.hhmi.org\path\to\folder'
 */
function removeTrailingSlashes(mountPath: string | null): string {
  // mountPath can be null if running in local env with no fileglancer_central url set in the jupter server config
  if (!mountPath) {
    return '';
  }
  return mountPath.replace(/\/+$/, '').replace(/\\+$/, '');
}

/**
 * Normalize to POSIX style path
 * For use in normalizing file or folder paths in initial data load
 * Assumes the path is already in POSIX style
 * Removes any leading slashes
 * E.g.:
 * normalizePosixStylePath('/path/to/folder/'); // Returns 'path/to/folder/'
 * normalizePosixStylePath('path/to/folder'); // Returns 'path/to/folder'
 */
function normalizePosixStylePath(pathString: string): string {
  const pathWithoutLeadingSlashes = pathString.replace(/^\//, ''); // Remove leading slashes
  return path.posix.normalize(pathWithoutLeadingSlashes);
}

/**
 * Joins multiple path segments into a single POSIX-style path, trimming any whitespace first.
 * This is useful for constructing API endpoints or file paths.
 * Example:
 * joinPaths('/api', 'fileglancer', 'files'); // Returns '/api/files'
 */
function joinPaths(...paths: string[]): string {
  return path.posix.join(...paths.map(path => path?.trim() ?? ''));
}

/**
 * Returns the root path for the Fileglancer API based on the current window location.
 * This is used to construct API paths relative to the current Jupyter environment, if applicable.
 * It checks for common JupyterLab and Jupyter Single User URL patterns.
 * Example:
 * getAPIPathRoot(); // Returns '/jupyter/user/username/' or '/user/username/'
 */
function getAPIPathRoot() {
  const path = window.location.pathname;
  const patterns = [
    /^\/jupyter\/user\/[^/]+\//, // JupyterLab
    /^\/user\/[^/]+\// // Jupyter Single User
  ];

  for (const pattern of patterns) {
    const match = path.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return '/';
}

/**
 * Constructs a URL for the UI to fetch folder and/or file information from the Fileglancer API.
 * If no filePath is provided, it returns the endpoint URL with the FSP path appended - this is the base URL.
 * If filePath is provided, it appends it as a URL param with key "subpath" to the base URL.
 * Example:
 * getFileBrowsePath('myFSP'); // Returns '/api/files/myFSP'
 * getFileBrowsePath('myFSP', 'path/to/folder'); // Returns '/api/files/myFSP?subpath=path%2Fto%2Ffolder'
 */
function getFileBrowsePath(fspName: string, filePath?: string): string {
  let fetchPath = joinPaths('/api/files/', fspName);

  const params: string[] = [];
  if (filePath) {
    params.push(`subpath=${encodeURIComponent(filePath)}`);
  }
  if (params.length > 0) {
    fetchPath += `?${params.join('&')}`;
  }

  return fetchPath;
}

/**
 * Constructs a URL for the UI to fetch file contents from the Fileglancer API.
 * If no filePath is provided, it returns the endpoint URL with the FSP path appended - this is the base URL.
 * If filePath is provided, it appends it as a URL param with key "subpath" to the base URL.
 * Example:
 * getFileContentPath('myFSP'); // Returns '/api/content/myFSP'
 * getFileContentPath('myFSP', 'path/to/file.txt'); // Returns '/api/content/myFSP?subpath=path%2Fto%2Ffile.txt'
 */
function getFileContentPath(fspName: string, filePath: string): string {
  let fetchPath = joinPaths('/api/content/', fspName);

  if (filePath) {
    fetchPath += `?subpath=${encodeURIComponent(filePath)}`;
  }

  return fetchPath;
}

/**
 * Constructs a sharable URL to access file contents from the browser with the Fileglancer API.
 * If no filePath is provided, it returns the endpoint URL with the FSP path appended - this is the base URL.
 * If filePath is provided, this is appended to the base URL with proper URL escaping.
 * Example:
 * getFileURL('myFSP'); // Returns 'http://localhost:8888/api/content/myFSP'
 * getFileURL('myFSP', 'path/to/file.txt'); // Returns 'http://localhost:8888/api/content/myFSP/path/to/file.txt'
 * getFileURL('myFSP', 'path with%/file.txt'); // Returns 'http://localhost:8888/api/content/myFSP/path%20with%25/file.txt'
 */
function getFileURL(fspName: string, filePath?: string): string {
  const escapedFspName = encodeURIComponent(fspName);
  const fspPath = joinPaths('/api/content/', escapedFspName);
  const apiPath = getFullPath(fspPath);

  if (filePath) {
    const escapedFilePath = escapePathForUrl(filePath);
    const apiFilePath = joinPaths(apiPath, escapedFilePath);
    return new URL(apiFilePath, window.location.origin).href;
  }

  return new URL(apiPath, window.location.origin).href;
}

/** * Constructs a full API path by joining the API root with a relative path.
 * This is useful for creating complete API endpoints based on the current Jupyter environment.
 * Example:
 * getFullPath('files/myFSP'); // Returns '/jupyter/user/username/files/myFSP'
 * getFullPath('content/myFSP/path/to/file.txt'); // Returns '/jupyter/user/username/content/myFSP/path/to/file.txt'
 * If no Jupyter environment is detected, it returns the relative path as is.
 * Example:
 * getFullPath('files/myFSP'); // Returns '/files/myFSP'
 */
function getFullPath(relativePath: string) {
  return joinPaths(getAPIPathRoot(), relativePath);
}

/**
 * Extracts the last segment of a path string.
 * For example, as used in the Folder UI component:
 * getLastSegmentFromPath('/path/to/folder'); // Returns 'folder'
 */
function getLastSegmentFromPath(itemPath: string): string {
  return path.basename(itemPath);
}

/**
 * Converts a path string to an array of path segments, splitting at PATH_DELIMITER.
 * For example, as used in the Crumbs UI component:
 * makePathSegmentArray('/path/to/folder'); // Returns ['path', 'to', 'folder']
 */
function makePathSegmentArray(itemPath: string): string[] {
  return itemPath.split(PATH_DELIMITER);
}

/**
 * Removes the last segment from a path string.
 * This is useful for navigating up one level in a file path.
 * For example:
 * removeLastSegmentFromPath('/path/to/folder'); // Returns '/path/to'
 */
function removeLastSegmentFromPath(itemPath: string): string {
  return path.dirname(itemPath);
}

/**
 * Converts a Windows-style path string to a POSIX-style path string.
 * Used for the navigation input to ensure paths match the expected format.
 */
function convertPathToPosixStyle(pathString: string): string {
  return pathString.replace(/\\/g, '/');
}

/**
 * Converts a POSIX-style path string to a Windows-style path string.
 * Should only be used in getPrefferedPathForDisplay function.
 * For example:
 * convertPathToWindowsStyle('path/to/folder'); // Returns 'path\to\folder'
 */
function convertPathToWindowsStyle(pathString: string): string {
  return pathString.replace(/\//g, '\\');
}

/**
 * Returns the preferred path for display (Linux, Mac or Windows) based on the provided path preference.
 * Assumes the mount paths in FileSharePath are already normalized (i.e., no trailing slashes, done in ZonesAndFspMapContext.tsx).
 * If provided, assumes the subPath is already in POSIX style (i.e., using forward slashes, done in FileBrowserContext.tsx).
 * If no preference is provided, defaults to 'linux_path'.
 * If subPath is provided, appends it to the base path.
 * Converts the path to Windows style if 'windows_path' is selected.
 */
function getPreferredPathForDisplay(
  pathPreference: ['linux_path' | 'windows_path' | 'mac_path'] = ['linux_path'],
  fsp?: FileSharePath | null,
  subPath?: string
): string {
  const pathKey = pathPreference[0] ?? 'linux_path';
  if (!fsp) {
    return '';
  }

  const basePath = fsp[pathKey] ?? fsp.linux_path;

  if (!basePath) {
    return '';
  } else if (!subPath) {
    return basePath;
  } else {
    let fullPath = joinPaths(basePath, subPath); // Linux = POSIX style

    if (pathKey === 'mac_path') {
      fullPath = basePath + PATH_DELIMITER + subPath;
    } else if (pathKey === 'windows_path') {
      fullPath = basePath + '\\' + convertPathToWindowsStyle(subPath);
    }

    return fullPath;
  }
}

/**
 * Constructs a browse link for a file share path.
 * If filePath is provided, appends it to the base path with proper URL escaping.
 * Example:
 * makeBrowseLink('myFSP'); // Returns '/browse/myFSP'
 * makeBrowseLink('myFSP', 'path/to/file.txt'); // Returns '/browse/myFSP/path/to/file.txt'
 * makeBrowseLink('myFSP', 'path with%/file.txt'); // Returns '/browse/myFSP/path%20with%25/file.txt'
 */
function makeBrowseLink(
  fspName: string | undefined,
  filePath?: string
): string {
  if (!fspName) {
    return '/browse';
  }
  const escapedFspName = encodeURIComponent(fspName);
  if (filePath) {
    const escapedFilePath = escapePathForUrl(filePath);
    return `/browse/${escapedFspName}/${escapedFilePath}`;
  }
  return `/browse/${escapedFspName}`;
}

export {
  convertPathToPosixStyle,
  escapePathForUrl,
  getAPIPathRoot,
  getFileBrowsePath,
  getFileContentPath,
  getFileURL,
  getFullPath,
  getLastSegmentFromPath,
  getPreferredPathForDisplay,
  joinPaths,
  makeBrowseLink,
  makePathSegmentArray,
  normalizePosixStylePath,
  removeLastSegmentFromPath,
  removeTrailingSlashes
};
