import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type SortingState
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useHotkey } from '@tanstack/react-hotkeys';
import { IconButton, Typography } from '@material-tailwind/react';
import { TbFile, TbLink, TbLinkOff } from 'react-icons/tb';
import { HiOutlineSwitchVertical } from 'react-icons/hi';
import { HiOutlineEllipsisHorizontalCircle, HiFolder } from 'react-icons/hi2';

import type { FileOrFolder } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { makeBrowseLink } from '@/utils/index';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import FgCheckbox from '@/components/designSystem/atoms/formElements/FgCheckbox';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgLink from '@/components/designSystem/atoms/FgLink';
import { SortIcons } from '@/components/ui/Table/TableCard';
import {
  NotificationItem,
  getNotificationStyles
} from '@/components/ui/Notifications/NotificationItem';
import {
  COLUMN_MIN_WIDTH,
  typeColumn,
  lastModifiedColumn,
  sizeColumn
} from '@/components/ui/BrowsePage/fileTableColumns';
import {
  fitColumnResize,
  fitColumnsToWidth
} from '@/components/ui/BrowsePage/columnSizing';

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
    isFetchingNextPage,
    toggleChecked,
    checkPaths,
    clearChecked
  } = useFileBrowserContext();
  const checkedPaths = fileBrowserState.checkedPaths;
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const tableRef = useRef<HTMLDivElement>(null);

  // Use the nearest scrollable ancestor (the main panel) as the virtualizer's
  // scroll element so the entire page (zarr preview + table) scrolls together.
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = tableRef.current;
    if (!el) {
      return;
    }

    let parent = el.parentElement;
    while (parent) {
      const { overflowY } = getComputedStyle(parent);
      if (overflowY === 'auto' || overflowY === 'scroll') {
        setScrollElement(parent);
        break;
      }
      parent = parent.parentElement;
    }
  }, []);
  const sortingDisabledByTruncation = Boolean(fileQuery.data?.isTruncated);
  const sortingDisabledByPagination =
    !sortingDisabledByTruncation && Boolean(hasNextPage);
  const sortingEnabled =
    !sortingDisabledByTruncation && !sortingDisabledByPagination;
  const sortingDisabledTooltip = sortingDisabledByTruncation
    ? 'Sort unavailable: folder is too large and contents are truncated'
    : 'Sort unavailable until all files are loaded';

  const selectedFileNames = useMemo(
    () => new Set(fileBrowserState.selectedFiles.map(file => file.name)),
    [fileBrowserState.selectedFiles]
  );

  const columns = useMemo<ColumnDef<FileOrFolder>[]>(
    () => [
      {
        id: 'select',
        header: () => {
          const allChecked =
            data.length > 0 && data.every(f => checkedPaths.has(f.path));
          return (
            <FgCheckbox
              checked={allChecked}
              hideLabel
              label="Select all"
              onChange={() =>
                allChecked ? clearChecked() : checkPaths(data.map(f => f.path))
              }
              onClick={e => e.stopPropagation()}
            />
          );
        },
        cell: ({ row }) => {
          const file = row.original;
          return (
            <FgCheckbox
              checked={checkedPaths.has(file.path)}
              hideLabel
              label={`Select ${file.name}`}
              onChange={() => toggleChecked(file.path)}
              onClick={e => e.stopPropagation()}
            />
          );
        },
        size: 44,
        minSize: 44,
        enableSorting: false,
        enableResizing: false
      },
      {
        accessorKey: 'name',
        header: 'Name',
        minSize: COLUMN_MIN_WIDTH,
        size: 500,
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
                <FgIcon
                  className="flex-shrink-0"
                  color="error"
                  icon={TbLinkOff}
                />
              ) : file.is_symlink ? (
                <FgIcon
                  className="flex-shrink-0"
                  color="primary"
                  icon={TbLink}
                />
              ) : file.is_dir ? (
                <FgIcon
                  className="text-foreground flex-shrink-0"
                  icon={HiFolder}
                />
              ) : (
                <FgIcon
                  className="text-foreground flex-shrink-0"
                  icon={TbFile}
                />
              )}
              <FgTooltip label={name} triggerClasses="max-w-full truncate">
                {isBrokenSymlink ? (
                  <Typography className="truncate text-foreground">
                    {name}
                  </Typography>
                ) : !isBrokenSymlink ? (
                  <Typography
                    as={FgLink}
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
        }
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
                <FgIcon
                  className="text-foreground"
                  icon={HiOutlineEllipsisHorizontalCircle}
                />
              </IconButton>
            </div>
          );
        },
        size: 90,
        minSize: COLUMN_MIN_WIDTH,
        enableSorting: false,
        // Last column: no right neighbour to trade width with
        enableResizing: false
      }
    ],
    [
      fileQuery.data?.currentFileSharePath,
      handleContextMenuClick,
      data,
      checkedPaths,
      toggleChecked,
      checkPaths,
      clearChecked
    ]
    // ponytail: columns rebuild on each check toggle (checkedPaths in deps). Fine for typical dir sizes; move check state into TanStack table `meta` if a huge-listing perf issue shows up.
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
      sorting,
      columnSizing
    },
    onSortingChange: setSorting,
    onColumnSizingChange: updater => {
      const resizedId = table.getState().columnSizingInfo.isResizingColumn;
      setColumnSizing(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (!resizedId) {
          return next;
        }
        // Before the first width measurement, sizes come from column defaults
        const current = Object.fromEntries(
          table.getAllLeafColumns().map(col => [col.id, col.getSize()])
        );
        return fitColumnResize(
          { ...current, ...prev },
          next,
          resizedId,
          sizableColumns()
        );
      });
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
    enableColumnFilters: false,
    enableSorting: sortingEnabled
  });

  const rows = table.getRowModel().rows;

  const sizableColumns = () =>
    table.getAllLeafColumns().map(col => ({
      id: col.id,
      minSize: col.columnDef.minSize ?? 0
    }));

  // Column `size` values are relative weights. Convert them to pixels that
  // fill the table's width, so a resize drag of N px moves the column edge
  // by N px (TanStack adds the mouse delta to the column size). On later
  // width changes the Name column absorbs the difference.
  useLayoutEffect(() => {
    const el = tableRef.current;
    if (!el) {
      return;
    }
    const fit = (width: number) => {
      if (!width) {
        return;
      }
      setColumnSizing(prev => {
        if (Object.keys(prev).length > 0) {
          return fitColumnsToWidth(prev, sizableColumns(), width, 'name');
        }
        const cols = table.getAllLeafColumns();
        const totalWeight = cols.reduce(
          (sum, col) => sum + (col.columnDef.size ?? 0),
          0
        );
        return Object.fromEntries(
          cols.map(col => [
            col.id,
            Math.max(
              col.columnDef.minSize ?? 0,
              Math.floor((width * (col.columnDef.size ?? 0)) / totalWeight)
            )
          ])
        );
      });
    };
    fit(el.clientWidth);
    const observer = new ResizeObserver(entries =>
      fit(Math.floor(entries[0].contentRect.width))
    );
    observer.observe(el);
    return () => observer.disconnect();
    // `table` and `sizableColumns` are stable enough; run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cursor shows which way a divider can still move: the column on its
  // left can shrink down to minSize, the one on its right can shrink to
  // let it grow.
  const leafColumns = table.getVisibleLeafColumns();
  const resizeCursor = (index: number) => {
    const left = leafColumns[index];
    const right = leafColumns[index + 1];
    const canShrink = left.getSize() > (left.columnDef.minSize ?? 0);
    const canGrow = right
      ? right.getSize() > (right.columnDef.minSize ?? 0)
      : false;
    if (canShrink && canGrow) {
      return 'cursor-col-resize';
    }
    if (canShrink) {
      return 'cursor-w-resize';
    }
    if (canGrow) {
      return 'cursor-e-resize';
    }
    // Nothing to move: let hover and drags pass through so the divider
    // does not light up
    return 'pointer-events-none';
  };

  const gridTemplateColumns = table
    .getVisibleLeafColumns()
    .map(col => `${col.getSize()}px`)
    .join(' ');
  const tableWidth = `${table.getTotalSize()}px`;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin: tableRef.current?.offsetTop ?? 0
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

  const isTruncated = fileQuery.data?.isTruncated ?? false;
  const maxCount = fileQuery.data?.maxCount ?? null;
  const truncationLimit =
    maxCount?.toLocaleString() ?? 'the configured limit of';

  return (
    <div className="min-w-full bg-background select-none" ref={tableRef}>
      {isTruncated ? (
        <div
          className={`${getNotificationStyles('warning').container} p-4 rounded-md mb-3`}
        >
          <NotificationItem
            notification={{
              id: 0,
              type: 'warning',
              title: 'Folder contents truncated',
              message: `This folder contains more than ${truncationLimit} items. Only ${truncationLimit} items are shown.`
            }}
            showDismissButton={false}
          />
        </div>
      ) : null}
      <div className="bg-background border-b border-surface">
        {table.getHeaderGroups().map(headerGroup => (
          <div
            className="grid min-w-full"
            key={headerGroup.id}
            style={{ gridTemplateColumns, width: tableWidth }}
          >
            {headerGroup.headers.map((header, index) => (
              <div
                className="text-left p-3 font-bold text-sm relative min-w-0"
                key={header.id}
              >
                {header.isPlaceholder ? null : (
                  <div
                    className={
                      header.column.columnDef.enableSorting !== false
                        ? `select-none flex items-center gap-2 ${sortingEnabled ? 'cursor-pointer' : 'cursor-default'}`
                        : 'flex items-center gap-2'
                    }
                    onClick={
                      sortingEnabled
                        ? header.column.getToggleSortingHandler()
                        : undefined
                    }
                  >
                    <span className="truncate">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </span>
                    {header.column.columnDef.enableSorting !== false ? (
                      sortingEnabled ? (
                        <SortIcons header={header} />
                      ) : (
                        <FgTooltip
                          icon={HiOutlineSwitchVertical}
                          label={sortingDisabledTooltip}
                          triggerClasses="flex items-center opacity-40 cursor-not-allowed"
                        />
                      )
                    ) : null}
                  </div>
                )}
                {header.column.getCanResize() ? (
                  <div
                    className={`${resizeCursor(index)} absolute z-10 -right-1 top-0 h-full w-3 bg-transparent group`}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                  >
                    <div className="absolute left-1/2 top-0 h-full w-[1px] bg-surface group-hover:bg-primary group-hover:w-[2px] group-focus:bg-primary group-focus:w-[2px] -translate-x-1/2" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div
        className="min-w-full"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: 'relative',
          width: tableWidth
        }}
      >
        {virtualItems.map(virtualRow => {
          const row = rows[virtualRow.index];
          const isSelected = selectedFileNames.has(row.original.name);
          return (
            <div
              className={`grid cursor-pointer hover:bg-surface dark:hover:bg-surface-light ${isSelected ? 'bg-primary-light/20 outline outline-1 outline-primary z-10' : virtualRow.index % 2 === 0 ? 'bg-surface-light dark:bg-surface/50' : ''}`}
              data-index={virtualRow.index}
              key={row.id}
              onClick={() =>
                handleLeftClick(row.original, showPropertiesDrawer)
              }
              onContextMenu={e => handleContextMenuClick(e, row.original)}
              ref={virtualizer.measureElement}
              role="row"
              style={{
                gridTemplateColumns,
                position: 'absolute',
                top: 0,
                left: 0,
                width: tableWidth,
                minWidth: '100%',
                transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`
              }}
            >
              {row.getVisibleCells().map(cell => (
                <div
                  className="p-3 text-foreground overflow-hidden min-w-0"
                  key={cell.id}
                  role="cell"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
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
  );
}
