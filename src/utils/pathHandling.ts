import path from 'path';
import type { FileSharePath } from '@/shared.types';

function joinPaths(...paths: string[]): string {
  return path.posix.join(...paths.map(path => path.trim()));
}

function getFileBrowsePath(
  fspName: string,
  filePath?: string
): string {
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

function getFileContentPath(
  fspName: string,
  filePath: string
): string {
  let fetchPath = joinPaths('/api/fileglancer/content/', fspName);

  const params: string[] = [];
  if (filePath) {
    params.push(`subpath=${encodeURIComponent(filePath)}`);
  }
  if (params.length > 0) {
    fetchPath += `?${params.join('&')}`;
  }

  return fetchPath;
}

function getFileURL(fspName: string, filePath?: string): string {
  let url = joinPaths(
    window.location.origin,
    '/api/fileglancer/content/',
    fspName
  );
  if (!filePath) {
    return url;
  } else if (filePath) {
    url = joinPaths(url, filePath);
  }
  return url;
}

function getLastSegmentFromPath(itemPath: string): string {
  return path.basename(itemPath);
}

function makePathSegmentArray(itemPath: string): string[] {
  return itemPath.split(path.sep);
}

function removeLastSegmentFromPath(itemPath: string): string {
  return path.dirname(itemPath);
}

function convertPathToWindowsStyle(pathString: string): string {
  // Convert POSIX-style path to Windows-style
  return pathString.replace(/\//g, '\\');
}

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

export {
  convertPathToWindowsStyle,
  getFileBrowsePath,
  getFileContentPath,
  getFileURL,
  getLastSegmentFromPath,
  getPreferredPathForDisplay,
  joinPaths,
  makePathSegmentArray,
  removeLastSegmentFromPath
};
