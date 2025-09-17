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
  readonly columns: ColumnDef<TData>[];
  readonly data: TData[];
  readonly gridColsClass: string;
  readonly loadingState?: boolean;
  readonly emptyText?: string;
  readonly enableColumnSearch?: boolean;
};

const TableRow = ({
  gridColsClass,
  children
}: {
  readonly gridColsClass: string;
  readonly children: React.ReactNode;
}) => {
  return (
    <div
      className={`grid ${gridColsClass} justify-items-start gap-4 px-4 py-4 border-b border-surface last:border-0 items-start`}
    >
      {children}
    </div>
  );
};
TableRow.displayName = 'TableRow';

const HeaderIcons = <TData, TValue>({
  header
}: {
  readonly header: Header<TData, TValue>;
}) => {
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
};
HeaderIcons.displayName = 'HeaderIcons';

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

const SearchPopover = <TData, TValue>({
  header
}: {
  readonly header: Header<TData, TValue>;
}) => {
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
      interactive={true}
      open={forceOpen ? true : undefined}
      placement="top-start"
    >
      {/** when open is undefined (forceOpen is false), then the interactive=true prop takes over.
       * This allows use of the safePolygon() function in tooltip.tsx, keeping the tooltip open
       * as the user moves towards it */}
      <Tooltip.Trigger
        as="div"
        className={`flex flex-col ${
          header.column.getCanSort() ? 'cursor-pointer group/sort' : ''
        } group/filter`}
        onClick={header.column.getToggleSortingHandler()}
        ref={tooltipRef}
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
          handleInputFocus={handleInputFocus}
          ref={inputRef}
          setValue={setValue}
          value={value}
        />
      </Tooltip.Content>
    </Tooltip>
  );
};
SearchPopover.displayName = 'SearchPopover';

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
                <SearchPopover header={header} key={header.id} />
              )
            )
          )}
      </div>

      {/* Body */}
      {loadingState ? (
        <TableRowSkeleton gridColsClass={gridColsClass} />
      ) : data && data.length > 0 ? (
        table.getRowModel().rows.map(row => (
          <TableRow gridColsClass={gridColsClass} key={row.id}>
            {row.getVisibleCells().map(cell => (
              <div key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            ))}
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
        emptyText={emptyText}
        enableColumnSearch={enableColumnSearch}
        gridColsClass={gridColsClass}
        loadingState={loadingState}
      />
    </Card>
  );
}

export { Table, TableRow, TableCard, HeaderIcons };
