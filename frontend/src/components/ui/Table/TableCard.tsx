import React from 'react';
import {
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Header,
  type SortingState
} from '@tanstack/react-table';
import {
  ButtonGroup,
  Card,
  IconButton,
  Input,
  Select,
  Tooltip,
  Typography
} from '@material-tailwind/react';
import {
  HiChevronDoubleLeft,
  HiChevronLeft,
  HiChevronDoubleRight,
  HiChevronRight,
  HiSortAscending,
  HiSortDescending,
  HiOutlineSwitchVertical,
  HiOutlineSearch
} from 'react-icons/hi';

import { TableRowSkeleton } from '@/components/ui/widgets/Loaders';

type TableProps<TData> = {
  readonly columns: ColumnDef<TData>[];
  readonly data: TData[];
  readonly gridColsClass: string;
  readonly loadingState?: boolean;
  readonly emptyText?: string;
  readonly enableColumnSearch?: boolean;
};

function TableRow({
  gridColsClass,
  children
}: {
  readonly gridColsClass: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      className={`grid ${gridColsClass} justify-items-start items-center gap-4 px-4 py-4 border-b border-surface last:border-0 items-start`}
    >
      {children}
    </div>
  );
}

function SortIcons<TData, TValue>({
  header
}: {
  readonly header: Header<TData, TValue>;
}) {
  return (
    <div className="flex items-center">
      {{
        asc: <HiSortAscending className="icon-default text-foreground" />,
        desc: <HiSortDescending className="icon-default text-foreground" />
      }[header.column.getIsSorted() as string] ?? null}
      {header.column.getCanSort() ? (
        <HiOutlineSwitchVertical
          className={`icon-default text-foreground/40 dark:text-foreground/60 hover:text-foreground/100 group-hover/sort:text-foreground/100 ${(header.column.getIsSorted() as string) ? 'hidden' : ''}`}
        />
      ) : null}
    </div>
  );
}

// Follows example here: https://tanstack.com/table/latest/docs/framework/react/examples/filters
const DebouncedInput = React.forwardRef<
  HTMLInputElement,
  {
    readonly value: string;
    readonly setValue: (value: string) => void;
    readonly handleInputFocus: () => void;
  }
>(({ value, setValue, handleInputFocus }, ref) => {
  return (
    <div className="max-w-full" onClick={e => e.stopPropagation()}>
      <Input
        className="w-36 max-w-full border shadow rounded"
        onChange={e => setValue(e.target.value)}
        onFocus={handleInputFocus}
        placeholder="Search..."
        ref={ref}
        type="search"
        value={value}
      />
    </div>
  );
});

DebouncedInput.displayName = 'DebouncedInput';

function SearchPopover<TData, TValue>({
  header
}: {
  readonly header: Header<TData, TValue>;
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

  return (
    <Tooltip
      interactive={true}
      open={forceOpen ? true : undefined}
      placement="top-start"
    >
      {/** when open is undefined (forceOpen is false), then the interactive=true prop takes over.
       * This allows use of the safePolygon() function in tooltip.tsx, keeping the tooltip open
       * as the user moves towards it */}
      <Tooltip.Trigger
        as="div"
        className="max-w-min flex flex-col"
        ref={tooltipRef}
      >
        <HiOutlineSearch className="icon-default text-foreground/40 dark:text-foreground/60 hover:text-foreground/100 hover:stroke-[3px]" />
      </Tooltip.Trigger>
      <Tooltip.Content
        className="z-10 min-w-36 border border-surface bg-background px-3 py-2.5 text-foreground"
        onMouseEnter={() => inputRef.current?.focus()}
      >
        <DebouncedInput
          handleInputFocus={handleInputFocus}
          ref={inputRef}
          setValue={setValue}
          value={value}
        />
      </Tooltip.Content>
    </Tooltip>
  );
}

function HeaderIcons<TData, TValue>({
  header
}: {
  readonly header: Header<TData, TValue>;
}) {
  if (!header.column.getCanFilter()) {
    // Non-filterable column - just show header with sorting
    return (
      <div
        className={`flex flex-col ${
          header.column.getCanSort() ? 'cursor-pointer' : ''
        }`}
        onClick={header.column.getToggleSortingHandler()}
      >
        <div className="flex items-center gap-2 font-semibold select-none group/sort">
          {flexRender(header.column.columnDef.header, header.getContext())}
          <SortIcons header={header} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 font-semibold select-none text-nowrap">
      <div
        className={`flex items-center gap-2 group/sort ${
          header.column.getCanSort() ? 'cursor-pointer' : ''
        }`}
        onClick={header.column.getToggleSortingHandler()}
      >
        {flexRender(header.column.columnDef.header, header.getContext())}
        <SortIcons header={header} />
      </div>
      <SearchPopover header={header} />
    </div>
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
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  return (
    <div className="flex flex-col h-full">
      {/* https://tanstack.com/table/latest/docs/framework/react/examples/pagination */}
      <div className="shrink-0 flex items-center gap-2 py-4 px-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Typography variant="small">Page</Typography>
            <Typography className="font-bold" variant="small">
              {table.getPageCount() === 0
                ? 0
                : table.getState().pagination.pageIndex + 1}{' '}
              of {table.getPageCount().toLocaleString()}
            </Typography>
          </div>
          <ButtonGroup variant="ghost">
            <IconButton
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.firstPage()}
            >
              <HiChevronDoubleLeft className="icon-default" />
            </IconButton>
            <IconButton
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <HiChevronLeft className="icon-default" />
            </IconButton>
            <IconButton
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <HiChevronRight className="icon-default" />
            </IconButton>
            <IconButton
              disabled={!table.getCanNextPage()}
              onClick={() => table.lastPage()}
            >
              <HiChevronDoubleRight className="icon-default" />
            </IconButton>
          </ButtonGroup>
        </div>
        <div>
          <Select
            onValueChange={(value: string) => {
              table.setPageSize(Number(value));
            }}
            value={table.getState().pagination.pageSize.toString()}
          >
            <Select.Trigger placeholder="Page size" />
            <Select.List>
              {['10', '20', '30', '40', '50'].map(pageSize => (
                <Select.Option key={pageSize} value={pageSize}>
                  {pageSize}/page
                </Select.Option>
              ))}
            </Select.List>
          </Select>
        </div>
      </div>
      <div
        className={`shrink-0 grid ${gridColsClass} gap-4 px-4 py-2 bg-surface/30`}
      >
        {table
          .getHeaderGroups()
          .map(headerGroup =>
            headerGroup.headers.map(header =>
              header.isPlaceholder ? null : (
                <HeaderIcons header={header} key={header.id} />
              )
            )
          )}
      </div>
      {/* Body */}
      {loadingState ? (
        <TableRowSkeleton gridColsClass={gridColsClass} />
      ) : data && data.length > 0 ? (
        <div className="max-h-full">
          {table.getRowModel().rows.map(row => (
            <TableRow gridColsClass={gridColsClass} key={row.id}>
              {row.getVisibleCells().map(cell => (
                <React.Fragment key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </React.Fragment>
              ))}
            </TableRow>
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="px-4 py-8 text-center text-foreground">
          {emptyText || 'No data available'}
        </div>
      ) : (
        <div className="px-4 py-8 text-center text-foreground">
          There was an error loading the data.
        </div>
      )}
    </div>
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
    <Card className="min-h-48">
      <Table
        columns={columns}
        data={data}
        emptyText={emptyText}
        enableColumnSearch={enableColumnSearch}
        gridColsClass={gridColsClass}
        loadingState={loadingState}
      />
    </Card>
  );
}

export { Table, TableRow, TableCard, SortIcons };
