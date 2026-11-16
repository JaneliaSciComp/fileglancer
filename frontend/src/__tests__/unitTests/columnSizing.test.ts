import { describe, it, expect } from 'vitest';

import {
  fitColumnResize,
  fitColumnsToWidth
} from '@/components/ui/BrowsePage/columnSizing';

const cols = [
  { id: 'select', minSize: 44 },
  { id: 'name', minSize: 100 },
  { id: 'type', minSize: 80 },
  { id: 'size', minSize: 100 }
];
// Fills a 1000px table exactly
const base = { select: 44, name: 556, type: 200, size: 200 };

const resize = (id: string, to: number) =>
  fitColumnResize(base, { ...base, [id]: to }, id, cols);

describe('fitColumnResize', () => {
  it('moves the divider: left column grows, right neighbour shrinks', () => {
    expect(resize('name', 656)).toEqual({ ...base, name: 656, type: 100 });
    expect(resize('name', 456)).toEqual({ ...base, name: 456, type: 300 });
  });

  it('stops when the right neighbour hits its minSize', () => {
    expect(resize('name', 900)).toEqual({ ...base, name: 676, type: 80 });
  });

  it('stops when the resized column hits its minSize', () => {
    expect(resize('type', 10)).toEqual({ ...base, type: 80, size: 320 });
  });

  it('never touches columns other than the two neighbours', () => {
    expect(resize('type', 300)).toEqual({ ...base, type: 300, size: 100 });
  });

  it('ignores a resize of the last column', () => {
    expect(resize('size', 300)).toEqual(base);
  });
});

describe('fitColumnsToWidth', () => {
  it('grows and shrinks Name with the table width, stopping at minSize', () => {
    expect(fitColumnsToWidth(base, cols, 1200, 'name').name).toBe(756);
    expect(fitColumnsToWidth(base, cols, 800, 'name').name).toBe(356);
    expect(fitColumnsToWidth(base, cols, 300, 'name').name).toBe(100);
  });
});
