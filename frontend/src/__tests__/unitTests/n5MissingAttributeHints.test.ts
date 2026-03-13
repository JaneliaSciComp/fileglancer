import { describe, it, expect } from 'vitest';
import { getN5MissingAttributeHints } from '@/components/ui/BrowsePage/N5MetadataTable';
import type { N5Metadata, N5RootAttributes } from '@/queries/n5Queries';

function makeMetadata(
  rootOverrides: Partial<N5RootAttributes> = {}
): N5Metadata {
  return {
    rootAttrs: {
      n5: '2.0.0',
      ...rootOverrides
    },
    s0Attrs: {
      dataType: 'uint16',
      compression: { type: 'gzip' },
      blockSize: [128, 128, 128],
      dimensions: [1000, 1000, 100]
    },
    dataUrl: 'http://example.com/data.n5'
  };
}

describe('getN5MissingAttributeHints', () => {
  it('should return no hints when all attributes are present', () => {
    const metadata = makeMetadata({
      resolution: [8, 8, 8],
      units: ['nm', 'nm', 'nm'],
      downsamplingFactors: [
        [1, 1, 1],
        [2, 2, 2]
      ]
    });

    expect(getN5MissingAttributeHints(metadata)).toEqual([]);
  });

  it('should not include n5-no-resolution when resolution is missing but pixelResolution.dimensions is present', () => {
    const metadata = makeMetadata({
      pixelResolution: { dimensions: [8, 8, 8], unit: 'nm' },
      units: ['nm', 'nm', 'nm'],
      downsamplingFactors: [
        [1, 1, 1],
        [2, 2, 2]
      ]
    });

    const hints = getN5MissingAttributeHints(metadata);
    expect(hints).not.toContain('n5-no-resolution');
  });

  it('should include n5-no-resolution when both resolution and pixelResolution are missing', () => {
    const metadata = makeMetadata({
      units: ['nm', 'nm', 'nm'],
      downsamplingFactors: [
        [1, 1, 1],
        [2, 2, 2]
      ]
    });

    const hints = getN5MissingAttributeHints(metadata);
    expect(hints).toContain('n5-no-resolution');
  });

  it('should not include n5-no-units when units is missing but pixelResolution.unit is present', () => {
    const metadata = makeMetadata({
      resolution: [8, 8, 8],
      pixelResolution: { dimensions: [8, 8, 8], unit: 'nm' },
      downsamplingFactors: [
        [1, 1, 1],
        [2, 2, 2]
      ]
    });

    const hints = getN5MissingAttributeHints(metadata);
    expect(hints).not.toContain('n5-no-units');
  });

  it('should include n5-no-units when both units and pixelResolution.unit are missing', () => {
    const metadata = makeMetadata({
      resolution: [8, 8, 8],
      downsamplingFactors: [
        [1, 1, 1],
        [2, 2, 2]
      ]
    });

    const hints = getN5MissingAttributeHints(metadata);
    expect(hints).toContain('n5-no-units');
  });

  it('should not include n5-no-downsampling when downsamplingFactors is present', () => {
    const metadata = makeMetadata({
      resolution: [8, 8, 8],
      units: ['nm', 'nm', 'nm'],
      downsamplingFactors: [
        [1, 1, 1],
        [2, 2, 2]
      ]
    });

    const hints = getN5MissingAttributeHints(metadata);
    expect(hints).not.toContain('n5-no-downsampling');
  });

  it('should not include n5-no-downsampling when scales is present as alternative', () => {
    const metadata = makeMetadata({
      resolution: [8, 8, 8],
      units: ['nm', 'nm', 'nm'],
      scales: [
        [1, 1, 1],
        [2, 2, 2]
      ]
    });

    const hints = getN5MissingAttributeHints(metadata);
    expect(hints).not.toContain('n5-no-downsampling');
  });

  it('should include n5-no-downsampling when neither downsamplingFactors nor scales is present', () => {
    const metadata = makeMetadata({
      resolution: [8, 8, 8],
      units: ['nm', 'nm', 'nm']
    });

    const hints = getN5MissingAttributeHints(metadata);
    expect(hints).toContain('n5-no-downsampling');
  });

  it('should return all three hints when all attributes are missing', () => {
    const metadata = makeMetadata();

    const hints = getN5MissingAttributeHints(metadata);
    expect(hints).toContain('n5-no-resolution');
    expect(hints).toContain('n5-no-units');
    expect(hints).toContain('n5-no-downsampling');
    expect(hints).toHaveLength(3);
  });
});
