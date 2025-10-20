/**
 * Mock Zarr metadata files for testing different Zarr file types
 */

// Type 1: Zarr Version 3, No OME Metadata
export const ZARR_V3_NON_OME_METADATA = {
  zarr_format: 3,
  node_type: 'array',
  shape: [1000, 1000],
  chunk_grid: {
    name: 'regular',
    configuration: {
      chunk_shape: [256, 256]
    }
  },
  data_type: 'uint8',
  chunk_key_encoding: {
    name: 'default',
    configuration: {
      separator: '/'
    }
  },
  codecs: [
    {
      name: 'gzip',
      configuration: {
        level: 5
      }
    }
  ],
  fill_value: 0
};

// Type 2: Zarr Version 3 OME-Zarr
// Identified by zarr.json with node_type === 'group' AND multiscales in attrs
export const ZARR_V3_OME_METADATA = {
  zarr_format: 3,
  node_type: 'group',
  attributes: {
    ome: {
      version: '0.5',
      multiscales: [
        {
          version: '0.4',
          name: 'minimal-test',
          type: 'image',
          axes: [
            { name: 'z', type: 'space', unit: 'micrometer' },
            { name: 'y', type: 'space', unit: 'micrometer' },
            { name: 'x', type: 'space', unit: 'micrometer' }
          ],
          datasets: [
            {
              path: 's0',
              coordinateTransformations: [
                { type: 'scale', scale: [1.0, 1.0, 1.0] }
              ]
            }
          ]
        }
      ]
    }
  }
};

// Array metadata for Zarr V3 OME-Zarr s0 dataset
export const ZARR_V3_OME_ARRAY_METADATA = {
  zarr_format: 3,
  node_type: 'array',
  shape: [100, 100, 100],
  data_type: 'uint16',
  chunk_grid: {
    name: 'regular',
    configuration: {
      chunk_shape: [64, 64, 64]
    }
  },
  chunk_key_encoding: {
    name: 'default',
    configuration: {
      separator: '/'
    }
  },
  fill_value: 0,
  codecs: [
    {
      name: 'bytes',
      configuration: {
        endian: 'little'
      }
    }
  ],
  attributes: {}
};

// Type 3: Zarr Version 2 Array
// Identified by .zarray file
export const ZARR_V2_NON_OME_METADATA = {
  chunks: [256, 256],
  compressor: {
    id: 'gzip',
    level: 5
  },
  dtype: '<u2',
  fill_value: 0,
  filters: null,
  order: 'C',
  shape: [2048, 2048],
  zarr_format: 2
};

// Zarr V2 group metadata
export const ZARR_V2_GROUP_METADATA = {
  zarr_format: 2
};

// Type 4: Zarr Version 2 OME-Zarr
// Identified by .zattrs file with multiscales property
export const ZARR_V2_OME_ZATTRS_METADATA = {
  multiscales: [
    {
      name: '/',
      version: '0.4',
      axes: [
        { type: 'space', name: 'z', unit: 'micrometer' },
        { type: 'space', name: 'y', unit: 'micrometer' },
        { type: 'space', name: 'x', unit: 'micrometer' }
      ],
      datasets: [
        {
          path: '0',
          coordinateTransformations: [
            {
              scale: [1.0, 1.0, 1.0],
              type: 'scale'
            }
          ]
        }
      ]
    }
  ]
};

// Array metadata for Zarr V2 OME-Zarr .zarray file (for resolution 0)
export const ZARR_V2_OME_ZARRAY_METADATA = {
  chunks: [64, 64, 64],
  compressor: {
    id: 'blosc',
    cname: 'zstd',
    clevel: 1,
    shuffle: 1
  },
  dtype: '<u2',
  fill_value: 0,
  filters: null,
  order: 'C',
  shape: [100, 100, 100],
  zarr_format: 2
};

export const ZARR_TEST_FILE_INFO = {
  v3_non_ome: {
    dirname: 'zarr_v3_non_ome.zarr',
    hasOmeMetadata: false,
    zarrVersion: 3,
    expectedViewers: ['neuroglancer']
  },
  v3_ome: {
    dirname: 'zarr_v3_ome.zarr',
    hasOmeMetadata: true,
    zarrVersion: 3,
    expectedViewers: ['validator', 'neuroglancer', 'vole']
  },
  v2_non_ome: {
    dirname: 'zarr_v2_non_ome.zarr',
    hasOmeMetadata: false,
    zarrVersion: 2,
    expectedViewers: ['neuroglancer']
  },
  v2_ome: {
    dirname: 'zarr_v2_ome.zarr',
    hasOmeMetadata: true,
    zarrVersion: 2,
    expectedViewers: ['validator', 'neuroglancer', 'vole', 'avivator']
  }
} as const;

// Synchronousfor use in playwright.config.ts
export function createZarrDirsSync(baseDir: string): void {
  const fsSync = require('fs');
  const path = require('path');

  // Type 1: Zarr V3 non OME
  const v3ArrayDir = path.join(baseDir, ZARR_TEST_FILE_INFO.v3_non_ome.dirname);
  fsSync.mkdirSync(v3ArrayDir, { recursive: true, mode: 0o755 });
  fsSync.writeFileSync(
    path.join(v3ArrayDir, 'zarr.json'),
    JSON.stringify(ZARR_V3_NON_OME_METADATA, null, 2),
    { mode: 0o644 }
  );

  // Type 2: Zarr V3 OME-Zarr
  const v3OmeDir = path.join(baseDir, ZARR_TEST_FILE_INFO.v3_ome.dirname);
  fsSync.mkdirSync(v3OmeDir, { recursive: true, mode: 0o755 });
  fsSync.writeFileSync(
    path.join(v3OmeDir, 'zarr.json'),
    JSON.stringify(ZARR_V3_OME_METADATA, null, 2),
    { mode: 0o644 }
  );
  // Create s0 subdirectory with array metadata
  const v3OmeS0Dir = path.join(v3OmeDir, 's0');
  fsSync.mkdirSync(v3OmeS0Dir, { recursive: true, mode: 0o755 });
  fsSync.writeFileSync(
    path.join(v3OmeS0Dir, 'zarr.json'),
    JSON.stringify(ZARR_V3_OME_ARRAY_METADATA, null, 2),
    { mode: 0o644 }
  );

  // Type 3: Zarr V2 Array
  const v2ArrayDir = path.join(baseDir, ZARR_TEST_FILE_INFO.v2_non_ome.dirname);
  fsSync.mkdirSync(v2ArrayDir, { recursive: true, mode: 0o755 });
  fsSync.writeFileSync(
    path.join(v2ArrayDir, '.zarray'),
    JSON.stringify(ZARR_V2_NON_OME_METADATA, null, 2),
    { mode: 0o644 }
  );

  // Type 4: Zarr V2 OME-Zarr (needs .zgroup and .zattrs at root, .zarray in dataset dirs)
  const v2OmeDir = path.join(baseDir, ZARR_TEST_FILE_INFO.v2_ome.dirname);
  fsSync.mkdirSync(v2OmeDir, { recursive: true, mode: 0o755 });
  fsSync.writeFileSync(
    path.join(v2OmeDir, '.zgroup'),
    JSON.stringify(ZARR_V2_GROUP_METADATA, null, 2),
    { mode: 0o644 }
  );
  fsSync.writeFileSync(
    path.join(v2OmeDir, '.zattrs'),
    JSON.stringify(ZARR_V2_OME_ZATTRS_METADATA, null, 2),
    { mode: 0o644 }
  );
  // Create 0 subdirectory with array metadata
  const v2Ome0Dir = path.join(v2OmeDir, '0');
  fsSync.mkdirSync(v2Ome0Dir, { recursive: true, mode: 0o755 });
  fsSync.writeFileSync(
    path.join(v2Ome0Dir, '.zarray'),
    JSON.stringify(ZARR_V2_OME_ZARRAY_METADATA, null, 2),
    { mode: 0o644 }
  );
}
