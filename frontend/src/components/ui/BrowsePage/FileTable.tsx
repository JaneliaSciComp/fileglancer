import { useCallback, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState
} from '@tanstack/react-table';
import { useHotkey } from '@tanstack/react-hotkeys';
import { IconButton, Typography } from '@material-tailwind/react';
import { TbFile, TbLink, TbLinkOff } from 'react-icons/tb';
import { HiOutlineEllipsisHorizontalCircle, HiFolder } from 'react-icons/hi2';

import type { FileOrFolder } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { makeBrowseLink } from '@/utils/index';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import { FgStyledLink } from '@/components/ui/widgets/FgLink';
import { SortIcons } from '@/components/ui/Table/TableCard';
import {
  typeColumn,
  lastModifiedColumn,
  sizeColumn
} from '@/components/ui/BrowsePage/fileTableColumns';

function getFileLink(
  file: FileOrFolder,
  currentFspName: string | undefined
): string | null {
  if (file.is_symlink && file.symlink_target_fsp) {
    return makeBrowseLink(
      file.symlink_target_fsp.fsp_name,
      file.symlink_target_fsp.subpath
    );
  }
  if (file.is_symlink && !file.symlink_target_fsp) {
    return null;
  }
  if (currentFspName) {
    return makeBrowseLink(currentFspName, file.path);
  }
  return null;
}

type TableProps = {
  readonly data: FileOrFolder[];
  readonly showPropertiesDrawer: boolean;
  readonly handleContextMenuClick: (
    e: MouseEvent<HTMLDivElement>,
    file: FileOrFolder
  ) => void;
};

export default function Table({
  data,
  showPropertiesDrawer,
  handleContextMenuClick
}: TableProps) {
  const { fileQuery, fileBrowserState, handleLeftClick } =
    useFileBrowserContext();
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([]);

  const selectedFileNames = useMemo(
    () => new Set(fileBrowserState.selectedFiles.map(file => file.name)),
    [fileBrowserState.selectedFiles]
  );

  const columns = useMemo<ColumnDef<FileOrFolder>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ getValue, row }) => {
          const file = row.original;
          const name = getValue() as string;
          const link = getFileLink(
            file,
            fileQuery.data?.currentFileSharePath?.name
          );
          const isBrokenSymlink = file.is_symlink && !file.symlink_target_fsp;

          return (
            <div className="flex items-center gap-3 min-w-0">
              {isBrokenSymlink ? (
                <TbLinkOff className="text-error icon-default flex-shrink-0" />
              ) : file.is_symlink ? (
                <TbLink className="text-primary icon-default flex-shrink-0" />
              ) : file.is_dir ? (
                <HiFolder className="text-foreground icon-default flex-shrink-0" />
              ) : (
                <TbFile className="text-foreground icon-default flex-shrink-0" />
              )}
              <FgTooltip label={name} triggerClasses="max-w-full truncate">
                {isBrokenSymlink ? (
                  <Typography className="truncate text-foreground">
                    {name}
                  </Typography>
                ) : !isBrokenSymlink ? (
                  <Typography
                    as={FgStyledLink}
                    className="truncate"
                    onClick={(e: MouseEvent) => e.stopPropagation()}
                    to={link ?? '#'}
                  >
                    {name}
                  </Typography>
                ) : (
                  <Typography className="truncate text-foreground">
                    {name}
                  </Typography>
                )}
              </FgTooltip>
            </div>
          );
        },
        size: 250
      },
      typeColumn,
      lastModifiedColumn,
      sizeColumn,
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const file = row.original;
          const isBrokenSymlink = file.is_symlink && !file.symlink_target_fsp;
          return (
            <div className="flex items-start">
              <IconButton
                className="min-w-fit min-h-fit"
                disabled={isBrokenSymlink}
                onClick={e => {
                  e.stopPropagation();
                  handleContextMenuClick(e as any, row.original);
                }}
                variant="ghost"
              >
                <HiOutlineEllipsisHorizontalCircle className="icon-default text-foreground" />
              </IconButton>
            </div>
          );
        },
        size: 30,
        enableSorting: false
      }
    ],
    [fileQuery.data?.currentFileSharePath, handleContextMenuClick]
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

  const rows = table.getRowModel().rows;
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  const navigateRows = useCallback(
    (direction: 'up' | 'down') => {
      if (rows.length === 0) {
        return;
      }

      const selectedName =
        fileBrowserState.selectedFiles.length > 0
          ? fileBrowserState.selectedFiles[0].name
          : null;

      const currentIndex = selectedName
        ? rows.findIndex(row => row.original.name === selectedName)
        : -1;

      let nextIndex: number;
      if (direction === 'down') {
        nextIndex = currentIndex < rows.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : rows.length - 1;
      }

      handleLeftClick(rows[nextIndex].original, showPropertiesDrawer);
      rowRefs.current.get(nextIndex)?.scrollIntoView({ block: 'nearest' });
    },
    [
      rows,
      fileBrowserState.selectedFiles,
      handleLeftClick,
      showPropertiesDrawer
    ]
  );

  useHotkey('ArrowDown', e => {
    e.preventDefault();
    navigateRows('down');
  });

  useHotkey('ArrowUp', e => {
    e.preventDefault();
    navigateRows('up');
  });

  useHotkey('Enter', e => {
    if (fileBrowserState.selectedFiles.length === 0) {
      return;
    }

    const link = getFileLink(
      fileBrowserState.selectedFiles[0],
      fileQuery.data?.currentFileSharePath?.name
    );
    if (!link) {
      return;
    }

    e.preventDefault();
    navigate(link);
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
          {rows.map((row, index) => {
            const isSelected = selectedFileNames.has(row.original.name);
            return (
              <tr
                className={`cursor-pointer hover:bg-primary-light/30 focus:bg-primary-light/30 ${isSelected && 'bg-primary-light/30'} ${index % 2 === 0 && !isSelected && 'bg-surface/50'}`}
                key={row.id}
                onClick={() =>
                  handleLeftClick(row.original, showPropertiesDrawer)
                }
                onContextMenu={e => handleContextMenuClick(e, row.original)}
                ref={el => {
                  if (el) {
                    rowRefs.current.set(index, el);
                  } else {
                    rowRefs.current.delete(index);
                  }
                }}
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
