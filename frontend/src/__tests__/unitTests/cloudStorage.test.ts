import { describe, it, expect } from 'vitest';

import type { FileSharePath } from '@/shared.types';
import { isReadOnlyFsp } from '@/utils/cloudStorage';
import { parseS3Url } from '@/utils/s3Url';

const fsp: FileSharePath = {
  zone: 'Zone1',
  name: 'test_fsp',
  group: 'group1',
  storage: 'primary',
  mount_path: '/test/fsp',
  linux_path: '/test/fsp',
  mac_path: null,
  windows_path: null,
  protocol: 'file'
};

describe('isReadOnlyFsp', () => {
  it('is false for file shares and missing values', () => {
    expect(isReadOnlyFsp({ ...fsp, protocol: 'file' })).toBe(false);
    expect(isReadOnlyFsp(null)).toBe(false);
    expect(isReadOnlyFsp(undefined)).toBe(false);
  });
  it('is true for s3', () =>
    expect(isReadOnlyFsp({ ...fsp, protocol: 's3' })).toBe(true));
});

describe('parseS3Url', () => {
  it.each([
    [
      's3://janelia-cosem-datasets/jrc_hela-2',
      {
        bucket: 'janelia-cosem-datasets',
        prefix: 'jrc_hela-2',
        endpointUrl: ''
      }
    ],
    ['s3://bucket', { bucket: 'bucket', prefix: '', endpointUrl: '' }],
    [
      'https://janelia-cosem-datasets.s3.amazonaws.com/jrc_hela-2/',
      {
        bucket: 'janelia-cosem-datasets',
        prefix: 'jrc_hela-2',
        endpointUrl: ''
      }
    ],
    [
      'https://my-bucket.s3.us-west-2.amazonaws.com/a/b',
      { bucket: 'my-bucket', prefix: 'a/b', endpointUrl: '' }
    ],
    [
      'https://s3.us-west-2.amazonaws.com/my-bucket/a/b',
      { bucket: 'my-bucket', prefix: 'a/b', endpointUrl: '' }
    ],
    [
      'https://s3.amazonaws.com/my-bucket',
      { bucket: 'my-bucket', prefix: '', endpointUrl: '' }
    ],
    [
      'https://store.example.org/idr/zarr/v0.4/x.ome.zarr',
      {
        bucket: 'idr',
        prefix: 'zarr/v0.4/x.ome.zarr',
        endpointUrl: 'https://store.example.org'
      }
    ],
    [
      'https://store.example.org:9000/idr',
      {
        bucket: 'idr',
        prefix: '',
        endpointUrl: 'https://store.example.org:9000'
      }
    ],
    [
      'https://store.example.org/idr/with%20space',
      {
        bucket: 'idr',
        prefix: 'with space',
        endpointUrl: 'https://store.example.org'
      }
    ]
  ])('parses %s', (input, expected) =>
    expect(parseS3Url(input)).toEqual(expected)
  );
  it.each([
    '',
    'not a url',
    'http://store.example.org/idr',
    'https://store.example.org',
    'https://store.example.org/'
  ])('returns null for %s', input => expect(parseS3Url(input)).toBeNull());
});
