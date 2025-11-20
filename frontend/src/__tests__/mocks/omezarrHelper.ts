import { vi } from 'vitest';

/**
 * Shared mock for @/omezarr-helper module used across Zarr component tests.
 * This bypasses zarrita
 */
export const omezarrHelperMock = {
  getZarrArray: vi.fn(async () => ({
    shape: [10, 512, 512],
    dtype: '<f4',
    chunks: [1, 128, 128]
  })),
  getOmeZarrMetadata: vi.fn(async () => ({
    arr: {
      shape: [10, 512, 512],
      dtype: '<f4',
      chunks: [1, 128, 128]
    },
    shapes: [[10, 512, 512]],
    multiscale: {
      axes: [
        { name: 'z', type: 'space', unit: 'micrometer' },
        { name: 'y', type: 'space', unit: 'micrometer' },
        { name: 'x', type: 'space', unit: 'micrometer' }
      ],
      datasets: [{ path: '0' }],
      version: '0.4'
    },
    omero: undefined,
    scales: [[1.0, 0.5, 0.5]],
    zarrVersion: 2
  })),
  getOmeZarrThumbnail: vi.fn(async () => [
    null,
    'Thumbnail generation disabled in tests'
  ]),
  generateNeuroglancerStateForDataURL: vi.fn(() => 'mock-state-data-url'),
  generateNeuroglancerStateForZarrArray: vi.fn(() => 'mock-state-zarr-array'),
  generateNeuroglancerStateForOmeZarr: vi.fn(() => 'mock-state-ome-zarr'),
  determineLayerType: vi.fn(async () => 'image'),
  translateUnitToNeuroglancer: vi.fn((unit: string) => unit),
  getResolvedScales: vi.fn(() => [1.0, 0.5, 0.5])
};
