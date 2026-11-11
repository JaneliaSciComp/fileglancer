import { describe, it, expect } from 'vitest';

import { transformBucketToDataUrl } from '@/queries/externalBucketQueries';

const BUCKET = {
  full_path: 'https://example-datasets.s3.amazonaws.com/zarr',
  external_url: 'https://example-datasets.s3.amazonaws.com/zarr',
  fsp_name: 'example',
  relative_path: ''
};

describe('transformBucketToDataUrl', () => {
  it('maps the FSP root "." to the bucket URL itself', () => {
    expect(transformBucketToDataUrl(BUCKET, '.', 'example')).toBe(
      'https://example-datasets.s3.amazonaws.com/zarr'
    );
  });

  it('appends encoded subpaths', () => {
    expect(transformBucketToDataUrl(BUCKET, 'a b/sample.zarr', 'example')).toBe(
      'https://example-datasets.s3.amazonaws.com/zarr/a%20b/sample.zarr'
    );
  });

  it('is null for another share', () => {
    expect(transformBucketToDataUrl(BUCKET, '.', 'other')).toBeNull();
  });
});
