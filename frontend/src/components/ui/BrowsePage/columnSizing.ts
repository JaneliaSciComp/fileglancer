import type { ColumnSizingState } from '@tanstack/react-table';

export type SizableColumn = { id: string; minSize: number };

function total(sizing: ColumnSizingState, cols: SizableColumn[]): number {
  return cols.reduce((sum, col) => sum + (sizing[col.id] ?? 0), 0);
}

/**
 * Dragging a divider moves it between its two neighbours only: the resized
 * column changes by N px and the column to its right by -N px, each stopping
 * at its minSize. The table never grows past its width. The last column has
 * no right neighbour, so it cannot be resized.
 */
export function fitColumnResize(
  prev: ColumnSizingState,
  next: ColumnSizingState,
  resizedId: string,
  cols: SizableColumn[]
): ColumnSizingState {
  const idx = cols.findIndex(col => col.id === resizedId);
  const left = cols[idx];
  const right = cols[idx + 1];
  if (!left || !right) {
    return prev;
  }
  const leftSize = prev[left.id] ?? 0;
  const rightSize = prev[right.id] ?? 0;
  const wanted = (next[resizedId] ?? 0) - leftSize;
  const delta = Math.max(
    left.minSize - leftSize,
    Math.min(wanted, rightSize - right.minSize)
  );
  return {
    ...prev,
    [left.id]: leftSize + delta,
    [right.id]: rightSize - delta
  };
}

/**
 * After the table width changes, grow or shrink `fillId` so the columns
 * still fill the width; shrink stops at its minSize (then the table scrolls).
 */
export function fitColumnsToWidth(
  sizing: ColumnSizingState,
  cols: SizableColumn[],
  width: number,
  fillId: string
): ColumnSizingState {
  const fill = cols.find(col => col.id === fillId);
  if (!fill) {
    return sizing;
  }
  const gap = width - total(sizing, cols);
  const size = Math.max(fill.minSize, (sizing[fillId] ?? 0) + gap);
  return size === sizing[fillId] ? sizing : { ...sizing, [fillId]: size };
}
