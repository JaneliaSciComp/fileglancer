import { describe, it, expect } from 'vitest';
import {
  parsePrecomputedInfo,
  precomputedState,
  precomputedSummary
} from '@/utils/precomputed';

const annotations = {
  '@type': 'neuroglancer_annotations_v1',
  dimensions: { y: [1e-9, 'm'], x: [1e-9, 'm'] },
  lower_bound: [5891875, 3523875],
  upper_bound: [11135875, 9613875],
  annotation_type: 'AXIS_ALIGNED_BOUNDING_BOX',
  properties: [
    { id: 'level', type: 'uint8' },
    { id: 'split', type: 'uint8' }
  ],
  relationships: [],
  by_id: { key: 'by_id' },
  spatial: [
    { key: 'spatial0', grid_shape: [1, 1], chunk_size: [1, 1], limit: 16 }
  ]
};

const volume = {
  type: 'segmentation',
  data_type: 'uint64',
  num_channels: 1,
  scales: [
    {
      key: '8_8_8',
      size: [100, 200, 300],
      resolution: [8, 8, 8],
      encoding: 'compressed_segmentation',
      chunk_sizes: [[64, 64, 64]]
    }
  ]
};

describe('parsePrecomputedInfo', () => {
  it('reads annotations as an annotation layer', () => {
    expect(parsePrecomputedInfo(annotations)).toMatchObject({
      kind: 'annotations',
      layerType: 'annotation'
    });
  });

  it('reads a volume without @type, taking its layer type from `type`', () => {
    expect(parsePrecomputedInfo(volume)).toMatchObject({
      kind: 'volume',
      layerType: 'segmentation'
    });
    expect(
      parsePrecomputedInfo({
        ...volume,
        '@type': 'neuroglancer_multiscale_volume',
        type: 'image'
      })
    ).toMatchObject({ kind: 'volume', layerType: 'image' });
  });

  it.each([
    ['neuroglancer_multilod_draco', 'mesh'],
    ['neuroglancer_legacy_mesh', 'mesh'],
    ['neuroglancer_skeletons', 'skeletons'],
    ['neuroglancer_segment_properties', 'segment properties']
  ])('reads %s as a segmentation layer', (type, kind) => {
    expect(parsePrecomputedInfo({ '@type': type })).toMatchObject({
      kind,
      layerType: 'segmentation'
    });
  });

  it.each([
    ['an unknown @type', { ...volume, '@type': 'something_else' }],
    ['an unrelated JSON file named info', { name: 'my project' }],
    ['a volume without scales', { ...volume, scales: [] }],
    ['a volume of an unknown type', { ...volume, type: 'mesh' }],
    ['annotations missing required keys', { '@type': annotations['@type'] }],
    ['a JSON array', [1, 2]],
    ['null', null]
  ])('rejects %s', (_label, info) => {
    expect(parsePrecomputedInfo(info)).toBeNull();
  });
});

describe('precomputedState', () => {
  const parsed = parsePrecomputedInfo(annotations)!;

  it('builds one layer named after the folder, with a precomputed:// source', () => {
    expect(precomputedState('https://h/files/K/v0-crops/', parsed)).toEqual({
      layers: [
        {
          name: 'v0-crops',
          source: 'precomputed://https://h/files/K/v0-crops',
          type: 'annotation'
        }
      ],
      selectedLayer: { visible: true, layer: 'v0-crops' },
      layout: '4panel-alt'
    });
  });

  it('leaves the layer type to Neuroglancer when source-only', () => {
    expect(precomputedState('https://h/x', parsed, true).layers[0].type).toBe(
      'new'
    );
  });
});

describe('precomputedSummary', () => {
  it('describes annotations', () => {
    expect(precomputedSummary(parsePrecomputedInfo(annotations)!)).toEqual([
      ['Type', 'annotations'],
      ['Annotation Type', 'AXIS_ALIGNED_BOUNDING_BOX'],
      ['Dimensions', 'y: 1e-9 m, x: 1e-9 m'],
      ['Lower Bound', '5891875, 3523875'],
      ['Upper Bound', '11135875, 9613875'],
      ['Properties', 'level, split']
    ]);
  });

  it('describes a volume from its first scale', () => {
    expect(precomputedSummary(parsePrecomputedInfo(volume)!)).toEqual([
      ['Type', 'volume (segmentation)'],
      ['Data Type', 'uint64'],
      ['Channels', '1'],
      ['Size', '100, 200, 300'],
      ['Resolution (nm)', '8, 8, 8'],
      ['Encoding', 'compressed_segmentation'],
      ['Multiscale Levels', '1']
    ]);
  });
});
