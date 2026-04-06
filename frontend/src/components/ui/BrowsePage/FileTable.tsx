import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useVirtualizer } from '@tanstack/react-virtual';
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

const ROW_HEIGHT = 44;
const OVERSCAN = 10;
const LOAD_MORE_THRESHOLD = 20;

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
  const {
    fileQuery,
    fileBrowserState,
    handleLeftClick,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage
  } = useFileBrowserContext();
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sortingEnabled = !hasNextPage;

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
        size: 250,
        minSize: 100
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
        size: 70,
        minSize: 70,
        enableSorting: false
      }
    ],
    [fileQuery.data?.currentFileSharePath, handleContextMenuClick]
  );

  // Clear sort when sorting becomes disabled (more pages still loading)
  useEffect(() => {
    if (!sortingEnabled && sorting.length > 0) {
      setSorting([]);
    }
  }, [sortingEnabled, sorting.length]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    enableColumnFilters: false,
    enableSorting: sortingEnabled
  });

  const rows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN
  });

  // Trigger loading more data when scrolling near the bottom
  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualItem = virtualItems[virtualItems.length - 1];
  const lastVirtualIndex = lastVirtualItem?.index ?? 0;

  useEffect(() => {
    if (virtualItems.length === 0) {
      return;
    }

    if (
      lastVirtualIndex >= rows.length - LOAD_MORE_THRESHOLD &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    lastVirtualIndex,
    virtualItems.length,
    rows.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage
  ]);

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
      virtualizer.scrollToIndex(nextIndex, { align: 'auto' });
    },
    [
      rows,
      fileBrowserState.selectedFiles,
      handleLeftClick,
      showPropertiesDrawer,
      virtualizer
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
    <div className="min-w-full bg-background select-none flex flex-col flex-1 min-h-0">
      <div className="bg-background border-b border-surface flex-shrink-0">
        {table.getHeaderGroups().map(headerGroup => (
          <div className="flex w-full" key={headerGroup.id}>
            {headerGroup.headers.map(header => {
              const isFlexColumn = header.column.id === 'name';
              return (
                <div
                  className={`text-left p-3 font-bold text-sm relative ${isFlexColumn ? 'flex-1 min-w-0' : 'flex-none'}`}
                  key={header.id}
                  style={{
                    width: isFlexColumn ? undefined : header.getSize(),
                    minWidth: header.column.columnDef.minSize
                  }}
                >
                  {header.isPlaceholder ? null : (
                    <div
                      className={
                        header.column.getCanSort()
                          ? `select-none flex items-center gap-2 ${sortingEnabled ? 'cursor-pointer' : 'cursor-default opacity-50'}`
                          : 'flex items-center gap-2'
                      }
                      onClick={
                        sortingEnabled
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {sortingEnabled ? <SortIcons header={header} /> : null}
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
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="overflow-auto flex-1" ref={scrollContainerRef}>
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative'
          }}
        >
          {virtualItems.map(virtualRow => {
            const row = rows[virtualRow.index];
            const isSelected = selectedFileNames.has(row.original.name);
            return (
              <div
                className={`flex cursor-pointer hover:bg-surface dark:hover:bg-surface-light ${isSelected ? 'bg-primary-light/20 outline outline-1 outline-primary' : virtualRow.index % 2 === 0 ? 'bg-surface-light dark:bg-surface/50' : ''}`}
                data-index={virtualRow.index}
                key={row.id}
                onClick={() =>
                  handleLeftClick(row.original, showPropertiesDrawer)
                }
                onContextMenu={e => handleContextMenuClick(e, row.original)}
                ref={virtualizer.measureElement}
                role="row"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                {row.getVisibleCells().map(cell => {
                  const isFlexColumn = cell.column.id === 'name';
                  return (
                    <div
                      className={`p-3 text-foreground overflow-hidden ${isFlexColumn ? 'flex-1 min-w-0' : 'flex-none'}`}
                      key={cell.id}
                      role="cell"
                      style={{
                        width: isFlexColumn ? undefined : cell.column.getSize(),
                        minWidth: cell.column.columnDef.minSize
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        {isFetchingNextPage ? (
          <div className="flex items-center justify-center py-3 text-sm text-foreground/60">
            Loading more files...
          </div>
        ) : null}
      </div>
    </div>
  );
}
