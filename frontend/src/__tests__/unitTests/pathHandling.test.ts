import { describe, test, expect, afterEach, beforeEach } from 'vitest';
import {
  joinPaths,
  buildUrl,
  getFileURL,
  getLastSegmentFromPath,
  getPreferredPathForDisplay,
  makePathSegmentArray,
  removeLastSegmentFromPath
} from '@/utils';
import {
  convertBackToForwardSlash,
  escapePathForUrl,
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

describe('convertBackToForwardSlash', () => {
  test('can convert Windows-style paths to POSIX', () => {
    expect(convertBackToForwardSlash('\\path\\to\\folder')).toBe(
      '/path/to/folder'
    );
  });
  test('keeps POSIX-style paths unchanged', () => {
    expect(convertBackToForwardSlash('/path/to/folder')).toBe(
      '/path/to/folder'
    );
  });
});

describe('escapePathForUrl', () => {
  test('escapes spaces in path segments', () => {
    expect(escapePathForUrl('file with spaces.txt')).toBe(
      'file%20with%20spaces.txt'
    );
  });
  test('escapes percentage signs in path segments', () => {
    expect(escapePathForUrl('file%with%signs.txt')).toBe(
      'file%25with%25signs.txt'
    );
  });
  test('preserves forward slashes as path separators', () => {
    expect(escapePathForUrl('folder/subfolder/file.txt')).toBe(
      'folder/subfolder/file.txt'
    );
  });
  test('escapes spaces and percentage signs while preserving path structure', () => {
    expect(escapePathForUrl('folder/sub folder/file 100%.txt')).toBe(
      'folder/sub%20folder/file%20100%25.txt'
    );
  });
  test('handles empty string', () => {
    expect(escapePathForUrl('')).toBe('');
  });
  test('preserves empty segments (double slashes)', () => {
    expect(escapePathForUrl('folder//subfolder')).toBe('folder//subfolder');
  });
  test('handles complex special characters', () => {
    expect(escapePathForUrl('path/file name (copy) 50%.txt')).toBe(
      'path/file%20name%20(copy)%2050%25.txt'
    );
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

describe('buildUrl', () => {
  describe('Overload 1: Single segment with query params', () => {
    test('builds URL with single segment', () => {
      expect(buildUrl('/api/files/', 'fsp_name', null)).toBe(
        '/api/files/fsp_name'
      );
    });
    test('builds URL with single segment and query params', () => {
      expect(
        buildUrl('/api/files/', 'fsp_name', { subpath: 'file.zarr' })
      ).toBe('/api/files/fsp_name?subpath=file.zarr');
    });
    test('encodes single path segment', () => {
      expect(buildUrl('/api/files/', 'my/fsp', null)).toBe(
        '/api/files/my%2Ffsp'
      );
    });
    test('encodes query parameter values', () => {
      expect(buildUrl('/api/files/', 'fsp', { subpath: 'a/b c' })).toBe(
        '/api/files/fsp?subpath=a%2Fb+c'
      );
    });
    test('handles no path segment, only query params', () => {
      expect(
        buildUrl('/api/ticket', null, {
          fsp_name: 'myFSP',
          path: 'folder/file.txt'
        })
      ).toBe('/api/ticket?fsp_name=myFSP&path=folder%2Ffile.txt');
    });
    test('handles single segment with no query params', () => {
      expect(buildUrl('/api/files/', 'fsp', null)).toBe('/api/files/fsp');
    });
    test('handles empty query params object', () => {
      expect(buildUrl('/api/files/', 'fsp', {})).toBe('/api/files/fsp');
    });
    test('builds URL with single query parameter', () => {
      expect(
        buildUrl('https://viewer.example.com/', null, {
          url: 'https://data.example.com/file.zarr'
        })
      ).toBe(
        'https://viewer.example.com?url=https%3A%2F%2Fdata.example.com%2Ffile.zarr'
      );
    });
    test('builds URL with multiple query parameters', () => {
      expect(
        buildUrl('https://example.com/form', null, {
          Version: '1.0.0',
          URL: 'https://app.com'
        })
      ).toBe(
        'https://example.com/form?Version=1.0.0&URL=https%3A%2F%2Fapp.com'
      );
    });
    test('encodes special characters in query parameters', () => {
      expect(
        buildUrl('https://validator.com/', null, {
          source: 'https://data.com/my file.zarr'
        })
      ).toBe(
        'https://validator.com?source=https%3A%2F%2Fdata.com%2Fmy+file.zarr'
      );
    });
  });

  describe('Overload 2: Multi-segment path', () => {
    test('builds URL with multi-segment path', () => {
      expect(
        buildUrl('https://s3.example.com/bucket', 'folder/file.zarr')
      ).toBe('https://s3.example.com/bucket/folder/file.zarr');
    });
    test('encodes path segments with special characters while preserving slashes', () => {
      expect(
        buildUrl(
          'https://s3.example.com/bucket',
          'path with spaces/file 100%.zarr'
        )
      ).toBe(
        'https://s3.example.com/bucket/path%20with%20spaces/file%20100%25.zarr'
      );
    });
    test('removes trailing slash from base URL before adding path', () => {
      expect(buildUrl('https://s3.example.com/bucket/', 'file.zarr')).toBe(
        'https://s3.example.com/bucket/file.zarr'
      );
    });
  });

  describe('Edge cases', () => {
    test('removes trailing slash from base URL', () => {
      expect(buildUrl('https://example.com/', null, { key: 'value' })).toBe(
        'https://example.com?key=value'
      );
    });
    test('handles base URL without trailing slash', () => {
      expect(buildUrl('https://example.com', null, { key: 'value' })).toBe(
        'https://example.com?key=value'
      );
    });
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
      'https://fileglancer-int.janelia.org/api/content/file-share-path/file.zarr'
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
