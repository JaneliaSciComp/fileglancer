import { getResolvedScales, translateUnitToNeuroglancer } from '@/omezarr-helper';

import type { Metadata } from '@/omezarr-helper';

export type DimensionSignature = {
  axes: { name: string; unit: string }[];
  scales: number[];
};

// ponytail: signature is axes (name+unit) + resolved voxel scales. That's the
// "will these layers align in Neuroglancer" question; shape is deliberately
// excluded per spec.
export function getDimensionSignature(
  metadata: Metadata
): DimensionSignature | null {
  const multiscale = metadata.multiscales?.[0];
  if (!multiscale?.axes || multiscale.axes.length === 0) {
    return null;
  }
  let scales: number[];
  try {
    scales = getResolvedScales(multiscale);
  } catch {
    return null;
  }
  return {
    axes: multiscale.axes.map(axis => ({
      name: axis.name.toLowerCase(),
      unit: translateUnitToNeuroglancer(axis.unit as string) || ''
    })),
    scales
  };
}

// Relative epsilon: voxel sizes span nm→µm, so absolute tolerance is wrong.
// ponytail: 1e-3 relative; tighten if false matches appear.
export function signaturesMatch(
  a: DimensionSignature,
  b: DimensionSignature,
  epsilon = 1e-3
): boolean {
  if (a.axes.length !== b.axes.length) {
    return false;
  }
  for (let i = 0; i < a.axes.length; i++) {
    if (a.axes[i].name !== b.axes[i].name) {
      return false;
    }
    if (a.axes[i].unit !== b.axes[i].unit) {
      return false;
    }
  }
  if (a.scales.length !== b.scales.length) {
    return false;
  }
  for (let i = 0; i < a.scales.length; i++) {
    const av = a.scales[i];
    const bv = b.scales[i];
    const denom = Math.max(Math.abs(av), Math.abs(bv), Number.MIN_VALUE);
    if (Math.abs(av - bv) / denom > epsilon) {
      return false;
    }
  }
  return true;
}
