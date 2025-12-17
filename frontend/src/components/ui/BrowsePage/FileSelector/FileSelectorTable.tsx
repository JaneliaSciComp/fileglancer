import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState
} from '@tanstack/react-table';
import { Typography } from '@material-tailwind/react';
import {
  HiOutlineFolder,
  HiOutlineSquares2X2,
  HiOutlineRectangleStack
} from 'react-icons/hi2';
import { TbFile } from 'react-icons/tb';

import type { FileOrFolder, FileSharePath, Zone } from '@/shared.types';
import type { FileSelectorLocation } from '@/hooks/useFileSelector';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import { SortIcons } from '@/components/ui/Table/TableCard';
import {
  typeColumn,
  lastModifiedColumn,
  sizeColumn
} from '@/components/ui/BrowsePage/fileTableColumns';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { getPreferredPathForDisplay, makeMapKey } from '@/utils';

type FileSelectorTableProps = {
  readonly data: FileOrFolder[];
  readonly currentLocation: FileSelectorLocation;
  readonly selectedItem: {
    name: string;
    isDir: boolean;
    fullPath: string;
  } | null;
  readonly zonesData: Record<string, FileSharePath | Zone> | undefined;
  readonly onItemClick: (item: FileOrFolder) => void;
  readonly onItemDoubleClick: (item: FileOrFolder) => void;
};

export default function FileSelectorTable({
  data,
  currentLocation,
  selectedItem,
  zonesData,
  onItemClick,
  onItemDoubleClick
}: FileSelectorTableProps) {
  const { hideDotFiles, pathPreference } = usePreferencesContext();
  const [sorting, setSorting] = useState<SortingState>([]);

  const displayFiles = useMemo(() => {
    let filtered = data;

    // Filter out dot files if preference is set
    if (hideDotFiles) {
      filtered = filtered.filter(
        (file: FileOrFolder) => !file.name.startsWith('.')
      );
    }

    return filtered;
  }, [data, hideDotFiles]);

  const columns = useMemo<ColumnDef<FileOrFolder>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ getValue, row }) => {
          const file = row.original;
          const name = getValue() as string;

          // Determine display name and icon based on location type
          let displayName = name;
          let icon;
          if (currentLocation.type === 'zones') {
            // At zones level: show zone icon for all items
            icon = (
              <HiOutlineSquares2X2 className="text-foreground icon-default flex-shrink-0" />
            );
          } else if (currentLocation.type === 'zone') {
            // At zone level: show FSP icon and use preferred path format
            icon = (
              <HiOutlineRectangleStack className="text-foreground icon-default flex-shrink-0" />
            );
            // Get FSP from zonesData and display in preferred format
            const fspKey = makeMapKey('fsp', name);
            const fsp = zonesData?.[fspKey] as FileSharePath;
            if (fsp) {
              displayName = getPreferredPathForDisplay(pathPreference, fsp);
            }
          } else {
            // At filesystem level: show folder or file icon
            icon = file.is_dir ? (
              <HiOutlineFolder className="text-foreground icon-default flex-shrink-0" />
            ) : (
              <TbFile className="text-foreground icon-default flex-shrink-0" />
            );
          }

          return (
            <div className="flex items-center gap-3 min-w-0">
              {icon}
              <FgTooltip
                label={displayName}
                triggerClasses="max-w-full truncate"
              >
                <Typography className="truncate">{displayName}</Typography>
              </FgTooltip>
            </div>
          );
        },
        size: 250
      },
      typeColumn,
      lastModifiedColumn,
      sizeColumn
    ],
    [currentLocation.type, zonesData, pathPreference]
  );

  const table = useReactTable({
    data: displayFiles,
    columns,
    state: {
      sorting
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: false,
    enableColumnFilters: false
  });

  return (
    <div className="min-w-full bg-background select-none overflow-auto h-full">
      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr className="border-b border-surface" key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  className="text-left p-3 font-bold text-sm text-foreground"
                  key={header.id}
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder ? null : (
                    <div
                      className={
                        header.column.getCanSort()
                          ? 'cursor-pointer select-none flex items-center gap-2'
                          : 'flex items-center gap-2'
                      }
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      <SortIcons header={header} />
                    </div>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td className="p-3 text-center" colSpan={columns.length}>
                <Typography className="text-foreground/60">
                  No items to display
                </Typography>
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row, index) => {
              const isSelected = selectedItem?.name === row.original.name;
              return (
                <tr
                  className={`cursor-pointer hover:bg-primary-light/30 focus:bg-primary-light/30 ${isSelected && 'bg-primary-light/30'} ${index % 2 === 0 && !isSelected && 'bg-surface/50'}`}
                  key={row.id}
                  onClick={() => onItemClick(row.original)}
                  onDoubleClick={() => onItemDoubleClick(row.original)}
                >
                  {row.getVisibleCells().map(cell => (
                    <td
                      className="p-3 text-grey-700 text-primary-light"
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
