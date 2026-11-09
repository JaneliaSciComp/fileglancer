import { Typography } from '@material-tailwind/react';
import type { ColumnDef } from '@tanstack/react-table';

import type { FileOrFolder } from '@/shared.types';
import { formatUnixTimestamp, formatFileSize } from '@/utils';

/** Shared minimum width; headers and cells truncate below their content */
export const COLUMN_MIN_WIDTH = 85;

/**
 * Shared column definition for Type column
 */
export const typeColumn: ColumnDef<FileOrFolder> = {
  accessorKey: 'is_dir',
  header: 'Type',
  cell: ({ row }) => {
    const file = row.original;
    if (file.is_symlink) {
      // Valid symlink
      return <Typography className="truncate">Symlink</Typography>;
    }
    return (
      <Typography className="truncate">
        {file.is_dir ? 'Folder' : 'File'}
      </Typography>
    );
  },
  sortingFn: (rowA, rowB) => {
    const a = rowA.original.is_dir;
    const b = rowB.original.is_dir;
    if (a === b) {
      return 0;
    }
    return a ? -1 : 1; // Folders first
  },
  size: 90,
  minSize: COLUMN_MIN_WIDTH
};

/**
 * Shared column definition for Last Modified column
 */
export const lastModifiedColumn: ColumnDef<FileOrFolder> = {
  accessorKey: 'last_modified',
  header: 'Last Modified',
  cell: ({ getValue }) => (
    <Typography className="truncate" variant="small">
      {getValue() ? formatUnixTimestamp(getValue() as number) : '—'}
    </Typography>
  ),
  size: 200,
  minSize: COLUMN_MIN_WIDTH
};

/**
 * Shared column definition for Size column
 */
export const sizeColumn: ColumnDef<FileOrFolder> = {
  accessorKey: 'size',
  header: 'Size',
  cell: ({ getValue, row }) => (
    <Typography className="truncate">
      {row.original.is_dir ? '—' : formatFileSize(getValue() as number)}
    </Typography>
  ),
  sortingFn: (rowA, rowB) => {
    const a = rowA.original.is_dir ? -1 : rowA.original.size;
    const b = rowB.original.is_dir ? -1 : rowB.original.size;
    return a - b;
  },
  size: 100,
  minSize: COLUMN_MIN_WIDTH
};
