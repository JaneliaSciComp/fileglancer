import path from 'path';
import log from 'loglevel';
import type { FileSharePath } from '@/shared.types';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';

const PATH_DELIMITER = '/';

/**
 * Joins multiple path segments into a single POSIX-style path, trimming any whitespace first.
 * This is useful for constructing API endpoints or file paths.
 * Example:
 * joinPaths('/api', 'fileglancer', 'files'); // Returns '/api/fileglancer/files'
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
 * getFileBrowsePath('myFSP'); // Returns '/api/fileglancer/files/myFSP'
 * getFileBrowsePath('myFSP', 'path/to/folder'); // Returns '/api/fileglancer/files/myFSP?subpath=path%2Fto%2Ffolder'
 */
function getFileBrowsePath(fspName: string, filePath?: string): string {
  let fetchPath = joinPaths('/api/fileglancer/files/', fspName);

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
 * getFileContentPath('myFSP'); // Returns '/api/fileglancer/content/myFSP'
 * getFileContentPath('myFSP', 'path/to/file.txt'); // Returns '/api/fileglancer/content/myFSP?subpath=path%2Fto%2Ffile.txt'
 */
function getFileContentPath(fspName: string, filePath: string): string {
  let fetchPath = joinPaths('/api/fileglancer/content/', fspName);

  if (filePath) {
    fetchPath += `?subpath=${encodeURIComponent(filePath)}`;
  }

  return fetchPath;
}

/**
 * Constructs a sharable URL to access file contents from the browser with the Fileglancer API.
 * If no filePath is provided, it returns the endpoint URL with the FSP path appended - this is the base URL.
 * If filePath is provided, this is appended to the base URL.
 * Example:
 * getFileURL('myFSP'); // Returns 'http://localhost:8888/api/fileglancer/content/myFSP'
 * getFileURL('myFSP', 'path/to/file.txt'); // Returns 'http://localhost:8888/api/fileglancer/content/myFSP/path/to/file.txt'
 */
function getFileURL(fspName: string, filePath?: string): string {
  const fspPath = joinPaths('/api/fileglancer/content/', fspName);
  const apiPath = getFullPath(fspPath);
  const apiFilePath = filePath ? joinPaths(apiPath, filePath) : apiPath;
  return new URL(apiFilePath, window.location.origin).href;
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
 * Converts a POSIX-style path string to a Windows-style path string.
 * Should only be used in getPrefferedPathForDisplay function.
 * For example:
 * convertPathToWindowsStyle('/path/to/folder'); // Returns '\path\to\folder'
 */
function convertPathToWindowsStyle(pathString: string): string {
  return pathString.replace(/\//g, '\\');
}

/**
 * Returns the preferred path for display (POSIX or Windows) based on the provided path preference.
 * If no preference is provided, defaults to 'linux_path'.
 * If fsp is null, returns an empty string.
 * If subPath is provided, appends it to the base path.
 * Converts the path to Windows style if 'windows_path' is selected.
 */
function getPreferredPathForDisplay(
  pathPreference: ['linux_path' | 'windows_path' | 'mac_path'] = ['linux_path'],
  fsp: FileSharePath | null = null,
  subPath?: string
): string {
  const pathKey = pathPreference[0] ?? 'linux_path';
  const basePath = fsp ? (fsp[pathKey] ?? fsp.linux_path) : '';

  let fullPath = subPath ? joinPaths(basePath, subPath) : basePath;

  if (pathKey === 'windows_path') {
    fullPath = convertPathToWindowsStyle(fullPath);
  }

  return fullPath;
}

/**
 * Constructs a browse link for a file share path.
 * If filePath is provided, appends it to the base path.
 * Example:
 * makeBrowseLink('myFSP'); // Returns '/browse/myFSP'
 * makeBrowseLink('myFSP', 'path/to/file.txt'); // Returns '/browse/myFSP/path/to/file.txt'
 */
function makeBrowseLink(
  fspName: string | undefined,
  filePath?: string
): string {
  if (!fspName) {
    log.warn('FSP name is required to create a browse link.');
    return '/browse';
  }
  return filePath ? `/browse/${fspName}/${filePath}` : `/browse/${fspName}`;
}

export {
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
  removeLastSegmentFromPath
};
