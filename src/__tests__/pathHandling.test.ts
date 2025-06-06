import { describe, test, expect } from 'vitest';
import {
  joinPaths,
  getFileFetchPath,
  getLastSegmentFromPath,
  getPreferredPathForDisplay,
  makePathSegmentArray,
  removeLastSegmentFromPath,
  convertPathToWindowsStyle
} from '@/utils';
import type { FileSharePath } from '@/shared.types';

describe('joinPaths', () => {
  test('joins paths in POSIX style', () => {
    expect(joinPaths('a', 'b', 'c')).toBe('a/b/c');
  });
  test('trims whitespace from segments', () => {
    expect(joinPaths('a ', ' b', 'c ')).toBe('a/b/c');
  });
});

describe('getFileFetchPath', () => {
  test('returns correct API path for normal path', () => {
    expect(getFileFetchPath('fsp_name', 'file.zarr')).toBe(
      '/api/fileglancer/files/fsp_name?subpath=file.zarr'
    );
  });
  test('handles empty string', () => {
    expect(getFileFetchPath('')).toBe('/api/fileglancer/files/');
  });
  test('handles parentOnly param', () => {
    expect(getFileFetchPath('fsp', 'file', true)).toBe(
      '/api/fileglancer/files/fsp?subpath=file&cwd_only=true'
    );
  });
  test('encodes filePath', () => {
    expect(getFileFetchPath('fsp', 'a/b c')).toBe(
      '/api/fileglancer/files/fsp?subpath=a%2Fb%20c'
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

describe('convertPathToWindowsStyle', () => {
  test('converts POSIX path to Windows path', () => {
    expect(convertPathToWindowsStyle('/a/b/c')).toBe('\\a\\b\\c');
  });
  test('handles already Windows-style path', () => {
    expect(convertPathToWindowsStyle('a\\b\\c')).toBe('a\\b\\c');
  });
  test('handles mixed slashes', () => {
    expect(convertPathToWindowsStyle('/a/b\\c/d')).toBe('\\a\\b\\c\\d');
  });
});

describe('getPreferredPathForDisplay', () => {
  const mockFsp = {
    zone: 'test_zone',
    name: 'test_fsp',
    group: 'Test File Share Path',
    storage: 'local',
    linux_path: '/mnt/data',
    windows_path: 'D:\\data',
    mac_path: '/Volumes/data'
  } as FileSharePath;

  test('returns linux_path by default', () => {
    expect(getPreferredPathForDisplay(undefined, mockFsp)).toBe('/mnt/data');
  });

  test('returns windows_path when preferred', () => {
    expect(getPreferredPathForDisplay(['windows_path'], mockFsp)).toBe(
      'D:\\data'
    );
  });

  test('returns mac_path when preferred', () => {
    expect(getPreferredPathForDisplay(['mac_path'], mockFsp)).toBe(
      '/Volumes/data'
    );
  });

  test('returns empty string if fsp is null', () => {
    expect(getPreferredPathForDisplay(['linux_path'], null)).toBe('');
  });

  test('joins subPath to base path', () => {
    expect(getPreferredPathForDisplay(['linux_path'], mockFsp, 'foo/bar')).toBe(
      '/mnt/data/foo/bar'
    );
  });

  test('joins subPath and converts to windows style if needed', () => {
    expect(
      getPreferredPathForDisplay(['windows_path'], mockFsp, 'foo/bar')
    ).toBe('D:\\data\\foo\\bar');
  });

  test('handles missing subPath', () => {
    expect(getPreferredPathForDisplay(['linux_path'], mockFsp)).toBe(
      '/mnt/data'
    );
  });

  test('handles empty fsp and subPath', () => {
    expect(getPreferredPathForDisplay(['linux_path'], null, 'foo')).toBe('foo');
  });
});
