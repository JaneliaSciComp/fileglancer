import React from 'react';
import {
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Header,
  type SortingState
} from '@tanstack/react-table';
import { Card, Input, Tooltip } from '@material-tailwind/react';
import {
  HiSortAscending,
  HiSortDescending,
  HiOutlineSwitchVertical,
  HiOutlineSearch
} from 'react-icons/hi';

import { TableRowSkeleton } from '@/components/ui/widgets/Loaders';

type TableProps<TData> = {
  columns: ColumnDef<TData>[];
  data: TData[];
  gridColsClass: string;
  loadingState?: boolean;
  emptyText?: string;
  enableColumnSearch?: boolean;
};

function TableRow({
  gridColsClass,
  children
}: {
  gridColsClass: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`grid ${gridColsClass} justify-items-start items-center gap-4 px-4 py-4 border-b border-surface last:border-0 items-start`}
    >
      {children}
    </div>
  );
}

function HeaderIcons<TData, TValue>({
  header
}: {
  header: Header<TData, TValue>;
}) {
  return (
    <div className="flex items-center">
      {{
        asc: <HiSortAscending className="icon-default text-foreground" />,
        desc: <HiSortDescending className="icon-default text-foreground" />
      }[header.column.getIsSorted() as string] ?? null}
      {header.column.getCanSort() ? (
        <HiOutlineSwitchVertical
          className={`icon-default text-foreground opacity-40 dark:opacity-60 ${(header.column.getIsSorted() as string) ? 'hidden' : ''}`}
        />
      ) : null}
      {header.column.getCanFilter() ? (
        <HiOutlineSearch className="icon-default text-foreground opacity-40 dark:opacity-60" />
      ) : null}
    </div>
  );
}

// Follows example here: https://tanstack.com/table/latest/docs/framework/react/examples/filters
const DebouncedInput = React.forwardRef<
  HTMLInputElement,
  {
    value: string;
    setValue: (value: string) => void;
    handleInputFocus: () => void;
  }
>(({ value, setValue, handleInputFocus }, ref) => {
  return (
    <div onClick={e => e.stopPropagation()} className="max-w-full">
      <Input
        ref={ref}
        type="search"
        placeholder="Search..."
        value={value}
        onChange={e => setValue(e.target.value)}
        onFocus={handleInputFocus}
        className="w-36 max-w-full border shadow rounded"
      />
    </div>
  );
});

function SearchPopover<TData, TValue>({
  header
}: {
  header: Header<TData, TValue>;
}) {
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const [forceOpen, setForceOpen] = React.useState(false);

  const initialValue = (header.column.getFilterValue() as string) || '';
  const [value, setValue] = React.useState(initialValue);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  const debounce = 350;

  function handleInputFocus() {
    setIsSearchFocused(true);
    setForceOpen(true);
  }

  const clearAndClose = React.useCallback(() => {
    setValue('');
    header.column.setFilterValue('');
    setIsSearchFocused(false);
    setForceOpen(false);
    inputRef.current?.blur();
  }, [header.column]);

  // Handle clicks outside the tooltip
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        forceOpen
      ) {
        clearAndClose();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [forceOpen, clearAndClose]);

  // Handle Escape key to clear and close tooltip
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && forceOpen) {
        clearAndClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [forceOpen, clearAndClose]);

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      header.column.setFilterValue(value);
    }, debounce);

    return () => clearTimeout(timeout);
  }, [value, debounce, header.column]);

  // Keep tooltip open if there's a search value
  React.useEffect(() => {
    if (value) {
      setForceOpen(true);
    } else if (!isSearchFocused) {
      setForceOpen(false);
    }
  }, [value, isSearchFocused]);

  if (!header.column.getCanFilter()) {
    // Non-filterable column - just show header with sorting
    return (
      <div
        className={`flex flex-col ${
          header.column.getCanSort() ? 'cursor-pointer group/sort' : ''
        }`}
        onClick={header.column.getToggleSortingHandler()}
      >
        <div className="flex items-center gap-2 font-semibold select-none">
          {flexRender(header.column.columnDef.header, header.getContext())}
          <HeaderIcons header={header} />
        </div>
      </div>
    );
  }

  return (
    <Tooltip
      placement="top-start"
      interactive={true}
      open={forceOpen ? true : undefined}
    >
      {/** when open is undefined (forceOpen is false), then the interactive=true prop takes over.
       * This allows use of the safePolygon() function in tooltip.tsx, keeping the tooltip open
       * as the user moves towards it */}
      <Tooltip.Trigger
        as="div"
        ref={tooltipRef}
        className={`flex flex-col ${
          header.column.getCanSort() ? 'cursor-pointer group/sort' : ''
        } group/filter`}
        onClick={header.column.getToggleSortingHandler()}
      >
        <div className="flex items-center gap-2 font-semibold select-none">
          {flexRender(header.column.columnDef.header, header.getContext())}
          <HeaderIcons header={header} />
        </div>
      </Tooltip.Trigger>
      <Tooltip.Content
        className="z-10 min-w-36 border border-surface bg-background px-3 py-2.5 text-foreground"
        onMouseEnter={() => inputRef.current?.focus()}
      >
        <DebouncedInput
          ref={inputRef}
          value={value}
          setValue={setValue}
          handleInputFocus={handleInputFocus}
        />
      </Tooltip.Content>
    </Tooltip>
  );
}

function Table<TData>({
  columns,
  data,
  gridColsClass,
  loadingState,
  emptyText,
  enableColumnSearch
}: TableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters
    },
    enableColumnFilters: enableColumnSearch || false,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel()
  });

  return (
    <>
      <div
        className={`grid ${gridColsClass} gap-4 px-4 py-2 border-b border-surface dark:border-foreground`}
      >
        {table
          .getHeaderGroups()
          .map(headerGroup =>
            headerGroup.headers.map(header =>
              header.isPlaceholder ? null : (
                <SearchPopover key={header.id} header={header} />
              )
            )
          )}
      </div>

      {/* Body */}
      {loadingState ? (
        <TableRowSkeleton gridColsClass={gridColsClass} />
      ) : data && data.length > 0 ? (
        table.getRowModel().rows.map(row => (
          <TableRow key={row.id} gridColsClass={gridColsClass}>
            {row
              .getVisibleCells()
              .map(cell =>
                flexRender(cell.column.columnDef.cell, cell.getContext())
              )}
          </TableRow>
        ))
      ) : !data || data.length === 0 ? (
        <div className="px-4 py-8 text-center text-foreground">
          {emptyText || 'No data available'}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-foreground">
          There was an error loading the data.
        </div>
      )}
    </>
  );
}

function TableCard<TData>({
  columns,
  data,
  gridColsClass,
  loadingState,
  emptyText,
  enableColumnSearch
}: TableProps<TData>) {
  return (
    <Card className="min-h-32 overflow-y-auto">
      <Table
        columns={columns}
        data={data}
        gridColsClass={gridColsClass}
        loadingState={loadingState}
        emptyText={emptyText}
        enableColumnSearch={enableColumnSearch}
      />
    </Card>
  );
}

export { Table, TableRow, TableCard, HeaderIcons };
