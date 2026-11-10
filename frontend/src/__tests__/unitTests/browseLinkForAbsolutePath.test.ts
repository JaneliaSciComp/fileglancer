import { describe, it, expect } from 'vitest';
import { browseLinkForAbsolutePath } from '@/utils/pathHandling';
import type { ZonesAndFileSharePathsMap } from '@/shared.types';

const fsp = (name: string, mount_path: string) =>
  ({ name, mount_path, zone: 'z', group: 'g', storage: 's' }) as never;

const map = {
  home: fsp('home_rokickik', '/groups/scicompsoft/home/rokickik'),
  zone: { name: 'nrs', fileSharePaths: [fsp('nrs_dudman', '/nrs/dudman')] }
} as unknown as ZonesAndFileSharePathsMap;

describe('browseLinkForAbsolutePath', () => {
  it('links a path inside a share, encoding the relative part', () => {
    expect(
      browseLinkForAbsolutePath(
        map,
        '/groups/scicompsoft/home/rokickik/.cache/zarrbridge/pyramids/9e/abc'
      )
    ).toBe('/browse/home_rokickik/.cache/zarrbridge/pyramids/9e/abc');
    expect(
      browseLinkForAbsolutePath(map, '/nrs/dudman/x/.zarrbridge/a 1.czi')
    ).toBe('/browse/nrs_dudman/x/.zarrbridge/a%201.czi');
  });

  it('returns null outside every share and does not match a prefix mid-segment', () => {
    expect(browseLinkForAbsolutePath(map, '/scratch/x')).toBeNull();
    expect(browseLinkForAbsolutePath(map, '/nrs/dudmanX/y')).toBeNull();
    expect(browseLinkForAbsolutePath(undefined, '/nrs/dudman/y')).toBeNull();
  });
});
