import React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState
} from '@tanstack/react-table';
import { IconButton, Typography } from '@material-tailwind/react';
import { TbFile } from 'react-icons/tb';
import {
  HiOutlineEllipsisHorizontalCircle,
  HiOutlineFolder
} from 'react-icons/hi2';

import type { FileOrFolder } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import {
  formatUnixTimestamp,
  formatFileSize,
  makeBrowseLink
} from '@/utils/index';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import { FgStyledLink } from '@/components/ui/widgets/FgLink';
import { SortIcons } from '@/components/ui/Table/TableCard';

type TableProps = {
  readonly data: FileOrFolder[];
  readonly showPropertiesDrawer: boolean;
  readonly handleContextMenuClick: (
    e: React.MouseEvent<HTMLDivElement>,
    file: FileOrFolder
  ) => void;
};

export default function Table({
  data,
  showPropertiesDrawer,
  handleContextMenuClick
}: TableProps) {
  const { fileBrowserState, handleLeftClick } = useFileBrowserContext();
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const selectedFileNames = React.useMemo(
    () => new Set(fileBrowserState.selectedFiles.map(file => file.name)),
    [fileBrowserState.selectedFiles]
  );

  const columns = React.useMemo<ColumnDef<FileOrFolder>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ getValue, row }) => {
          const file = row.original;
          const name = getValue() as string;
          let link = '#';

          if (file.is_dir && fileBrowserState.currentFileSharePath) {
            link = makeBrowseLink(
              fileBrowserState.currentFileSharePath.name,
              file.path
            ) as string;
          }

          return (
            <div className="flex items-center gap-3 min-w-0">
              {file.is_dir ? (
                <HiOutlineFolder className="text-foreground icon-default flex-shrink-0" />
              ) : (
                <TbFile className="text-foreground icon-default flex-shrink-0" />
              )}
              <FgTooltip label={name} triggerClasses="max-w-full truncate">
                {file.is_dir ? (
                  <Typography as={FgStyledLink} className="truncate" to={link}>
                    {name}
                  </Typography>
                ) : (
                  <Typography className="truncate">{name}</Typography>
                )}
              </FgTooltip>
            </div>
          );
        },
        size: 250
      },
      {
        accessorKey: 'is_dir',
        header: 'Type',
        cell: ({ getValue }) => (
          <Typography>{getValue() ? 'Folder' : 'File'}</Typography>
        ),
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.is_dir;
          const b = rowB.original.is_dir;
          if (a === b) {
            return 0;
          }
          return a ? -1 : 1; // Folders first
        },
        size: 80
      },
      {
        accessorKey: 'last_modified',
        header: 'Last Modified',
        cell: ({ getValue }) => (
          <Typography className="truncate" variant="small">
            {formatUnixTimestamp(getValue() as number)}
          </Typography>
        ),
        size: 130
      },
      {
        accessorKey: 'size',
        header: 'Size',
        cell: ({ getValue, row }) => (
          <Typography>
            {row.original.is_dir ? '—' : formatFileSize(getValue() as number)}
          </Typography>
        ),
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.is_dir ? -1 : rowA.original.size;
          const b = rowB.original.is_dir ? -1 : rowB.original.size;
          return a - b;
        },
        size: 75
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex items-start">
            <IconButton
              className="min-w-fit min-h-fit"
              onClick={e => {
                e.stopPropagation();
                handleContextMenuClick(e as any, row.original);
              }}
              variant="ghost"
            >
              <HiOutlineEllipsisHorizontalCircle className="icon-default text-foreground" />
            </IconButton>
          </div>
        ),
        size: 30,
        enableSorting: false
      }
    ],
    [fileBrowserState.currentFileSharePath, handleContextMenuClick]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange', // Note - if users experience lag with resizing, might need to memoize table body https://tanstack.com/table/latest/docs/framework/react/examples/column-resizing-performant
    enableColumnResizing: true,
    enableColumnFilters: false
  });

  return (
    <div className="min-w-full bg-background select-none">
      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr className="border-b border-surface" key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  className="text-left p-3 font-bold text-sm relative"
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
                  {header.column.getCanResize() ? (
                    <div
                      className="cursor-col-resize absolute z-10 -right-1 top-0 h-full w-3 bg-transparent group"
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                    >
                      <div className="absolute left-1/2 top-0 h-full w-[1px] bg-surface group-hover:bg-primary group-hover:w-[2px] group-focus:bg-primary group-focus:w-[2px] -translate-x-1/2" />
                    </div>
                  ) : null}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, index) => {
            const isSelected = selectedFileNames.has(row.original.name);
            return (
              <tr
                className={`cursor-pointer hover:bg-primary-light/30 focus:bg-primary-light/30 ${isSelected && 'bg-primary-light/30'} ${index % 2 === 0 && !isSelected && 'bg-surface/50'}`}
                key={row.id}
                onClick={() =>
                  handleLeftClick(row.original, showPropertiesDrawer)
                }
                onContextMenu={e => handleContextMenuClick(e, row.original)}
              >
                {row.getVisibleCells().map(cell => (
                  <td
                    className="p-3 text-grey-700"
                    key={cell.id}
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
