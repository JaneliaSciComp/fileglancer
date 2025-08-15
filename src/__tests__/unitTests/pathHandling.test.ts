import { describe, test, expect, afterEach, beforeEach } from 'vitest';
import {
  joinPaths,
  getFileBrowsePath,
  getFileURL,
  getLastSegmentFromPath,
  getPreferredPathForDisplay,
  makePathSegmentArray,
  removeLastSegmentFromPath
} from '@/utils';
import {
  convertPathToPosixStyle,
  normalizePosixStylePath,
  removeTrailingSlashes
} from '@/utils/pathHandling';
import type { FileSharePath } from '@/shared.types';

describe('removeTrailingSlashes', () => {
  test('removes trailing forward slashes', () => {
    expect(removeTrailingSlashes('/a/b/c/')).toBe('/a/b/c');
  });
  test('removes trailing backward slashes', () => {
    expect(removeTrailingSlashes('\\\\prfs.hhmi.org\\path\\to\\folder\\')).toBe(
      '\\\\prfs.hhmi.org\\path\\to\\folder'
    );
  });
  test('returns empty string for null input', () => {
    expect(removeTrailingSlashes(null)).toBe('');
  });
});

describe('convertPathToPosixStyle', () => {
  test('can convert Windows-style paths to POSIX', () => {
    expect(convertPathToPosixStyle('\\path\\to\\folder')).toBe(
      '/path/to/folder'
    );
  });
  test('keeps POSIX-style paths unchanged', () => {
    expect(convertPathToPosixStyle('/path/to/folder')).toBe('/path/to/folder');
  });
});

describe('normalizePosixStylePath', () => {
  test('normalizes POSIX-style path', () => {
    expect(normalizePosixStylePath('/a/b/c/')).toBe('a/b/c/');
  });
  test('handles paths without leading slash', () => {
    expect(normalizePosixStylePath('a/b/c')).toBe('a/b/c');
  });
});

describe('joinPaths', () => {
  test('joins paths in POSIX style', () => {
    expect(joinPaths('a//', 'b/', '/c')).toBe('a/b/c');
  });
  test('trims whitespace from segments', () => {
    expect(joinPaths('a ', ' b', 'c ')).toBe('a/b/c');
  });
});

describe('getFileBrowsePath', () => {
  test('returns correct API path for normal path', () => {
    expect(getFileBrowsePath('fsp_name', 'file.zarr')).toBe(
      '/api/fileglancer/files/fsp_name?subpath=file.zarr'
    );
  });
  test('handles empty string', () => {
    expect(getFileBrowsePath('')).toBe('/api/fileglancer/files/');
  });
  test('encodes filePath', () => {
    expect(getFileBrowsePath('fsp', 'a/b c')).toBe(
      '/api/fileglancer/files/fsp?subpath=a%2Fb%20c'
    );
  });
});

describe('getFileURL', () => {
  // Save the original location to restore later
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        origin: 'https://fileglancer-int.janelia.org',
        pathname: '/'
      }
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation
    });
  });

  test('returns correctly formatted URL', () => {
    expect(getFileURL('file-share-path', 'file.zarr')).toBe(
      'https://fileglancer-int.janelia.org/api/fileglancer/content/file-share-path/file.zarr'
    );
  });
});

describe('getLastSegmentFromPath', () => {
  test('returns last segment of POSIX-style path', () => {
    expect(getLastSegmentFromPath('/a/b/c.txt')).toBe('c.txt');
  });
});

describe('makePathSegmentArray', () => {
  test('splits POSIX-style path into segments', () => {
    expect(makePathSegmentArray('/a/b/c')).toEqual(['', 'a', 'b', 'c']);
  });
});

describe('removeLastSegmentFromPath', () => {
  test('removes last segment from POSIX-style path', () => {
    expect(removeLastSegmentFromPath('/a/b/c.txt')).toBe('/a/b');
  });
});

describe('getPreferredPathForDisplay', () => {
  const mockFsp = {
    zone: 'test_zone',
    name: 'test_fsp',
    group: 'Test File Share Path',
    storage: 'local',
    linux_path: '/groups/group',
    windows_path: '\\prfs.hhmi.org\\group',
    mac_path: 'smb://prfs.hhmi.org/group'
  } as FileSharePath;

  test('returns linux_path by default', () => {
    expect(getPreferredPathForDisplay(undefined, mockFsp)).toBe(
      '/groups/group'
    );
  });

  test('returns windows_path when preferred', () => {
    expect(getPreferredPathForDisplay(['windows_path'], mockFsp)).toBe(
      '\\prfs.hhmi.org\\group'
    );
  });

  test('returns mac_path when preferred', () => {
    expect(getPreferredPathForDisplay(['mac_path'], mockFsp)).toBe(
      'smb://prfs.hhmi.org/group'
    );
  });

  test('joins subPath to base path', () => {
    expect(getPreferredPathForDisplay(['linux_path'], mockFsp, 'foo/bar')).toBe(
      '/groups/group/foo/bar'
    );
  });

  test('joins subPath and converts to windows style if needed', () => {
    expect(
      getPreferredPathForDisplay(['windows_path'], mockFsp, 'foo/bar')
    ).toBe('\\prfs.hhmi.org\\group\\foo\\bar');
  });

  test('joins subPath to mac mount path with correct delimiter', () => {
    expect(getPreferredPathForDisplay(['mac_path'], mockFsp, 'foo/bar')).toBe(
      'smb://prfs.hhmi.org/group/foo/bar'
    );
  });

  test('returns empty string if fsp is null', () => {
    expect(getPreferredPathForDisplay(['linux_path'], null)).toBe('');
  });
});
