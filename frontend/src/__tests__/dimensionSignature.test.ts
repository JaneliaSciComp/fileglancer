import { describe, expect, it } from 'vitest';
import { signaturesMatch } from '@/utils/dimensionSignature';
import type { DimensionSignature } from '@/utils/dimensionSignature';

const sig = (
  axes: [string, string][],
  scales: number[]
): DimensionSignature => ({
  axes: axes.map(([name, unit]) => ({ name, unit })),
  scales
});

describe('signaturesMatch', () => {
  it('matches identical axes and scales', () => {
    const a = sig([['x', 'micrometer'], ['y', 'micrometer']], [0.1, 0.1]);
    const b = sig([['x', 'micrometer'], ['y', 'micrometer']], [0.1, 0.1]);
    expect(signaturesMatch(a, b)).toBe(true);
  });

  it('mismatches when axis names/order differ', () => {
    const a = sig([['x', 'um'], ['y', 'um'], ['z', 'um']], [1, 1, 1]);
    const b = sig([['x', 'um'], ['y', 'um']], [1, 1]);
    expect(signaturesMatch(a, b)).toBe(false);
  });

  it('mismatches when a unit differs', () => {
    const a = sig([['x', 'micrometer']], [1]);
    const b = sig([['x', 'nanometer']], [1]);
    expect(signaturesMatch(a, b)).toBe(false);
  });

  it('mismatches when voxel scale differs beyond relative epsilon', () => {
    const a = sig([['x', 'um']], [0.1]);
    const b = sig([['x', 'um']], [0.2]);
    expect(signaturesMatch(a, b)).toBe(false);
  });

  it('matches when scales differ within relative epsilon', () => {
    const a = sig([['x', 'um']], [0.1]);
    const b = sig([['x', 'um']], [0.10005]); // 0.05% off
    expect(signaturesMatch(a, b)).toBe(true);
  });

  it('matches tiny nanometer-scale values that are effectively equal', () => {
    const a = sig([['x', 'nm']], [4]);
    const b = sig([['x', 'nm']], [4.001]);
    expect(signaturesMatch(a, b)).toBe(true);
  });
});
