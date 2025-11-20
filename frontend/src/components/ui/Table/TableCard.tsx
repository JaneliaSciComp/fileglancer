import {
  Fragment,
  useState,
  forwardRef,
  useRef,
  useEffect,
  useCallback
} from 'react';
import type { ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type Header,
  type SortingState
} from '@tanstack/react-table';
import {
  ButtonGroup,
  Card,
  IconButton,
  Input,
  Select,
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
import { HiXMark } from 'react-icons/hi2';

import { TableRowSkeleton } from '@/components/ui/widgets/Loaders';
import { formatDateString } from '@/utils';
import type { PathCellValue } from './linksColumns';

type TableProps<TData> = {
  readonly columns: ColumnDef<TData>[];
  readonly data: TData[];
  readonly gridColsClass: string;
  readonly loadingState?: boolean;
  readonly emptyText?: string;
};

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
const DebouncedInput = forwardRef<
  HTMLInputElement,
  {
    readonly value: string;
    readonly setValue: (value: string) => void;
  }
>(({ value, setValue }, ref) => {
  return (
    <div className="max-w-full" onClick={e => e.stopPropagation()}>
      <Input
        className="bg-background text-foreground [&::-webkit-search-cancel-button]:appearance-none"
        onChange={e => setValue(e.target.value)}
        placeholder="Search all columns..."
        ref={ref}
        type="search"
        value={value}
      >
        <Input.Icon>
          <HiOutlineSearch />
        </Input.Icon>
      </Input>
    </div>
  );
});

DebouncedInput.displayName = 'DebouncedInput';

function HeaderIcons<TData, TValue>({
  header
}: {
  readonly header: Header<TData, TValue>;
}) {
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

// Helper function to check if a string looks like an ISO date
const isISODate = (str: string): boolean => {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str);
};

// Helper function to check match based on length heuristic
// If query is shorter or equal in length to value, check if value contains query
// If query is longer, check if query contains value
const lengthAwareMatch = (value: string, query: string): boolean => {
  if (!value) {
    return false;
  }
  if (query.length <= value.length) {
    return value.includes(query);
  } else if (query.length > value.length && value.length > 1) {
    return query.includes(value);
  } else {
    return false;
  }
};

// Custom global filter function that searches all columns
const globalFilterFn: FilterFn<unknown> = (row, _columnId, filterValue) => {
  if (!filterValue) {
    return true;
  }

  const query = String(filterValue).toLowerCase();

  const rowValues = row.getVisibleCells().flatMap(cell => {
    const value = cell.getValue();
    if (value === null || value === undefined) {
      return [''];
    }

    // Special handling for path column with PathCellValue
    if (
      typeof value === 'object' &&
      value !== null &&
      'pathMap' in value &&
      'displayPath' in value
    ) {
      const pathValue = value as PathCellValue;
      // Return all three path types for searching
      return [
        pathValue.pathMap.mac_path.toLowerCase(),
        pathValue.pathMap.linux_path.toLowerCase(),
        pathValue.pathMap.windows_path.toLowerCase()
      ];
    }

    const strValue = String(value);
    // Special handling for date columns: format the ISO date before searching
    if (isISODate(strValue)) {
      return [formatDateString(strValue).toLowerCase()];
    }
    return [strValue.toLowerCase()];
  });

  return rowValues.some(value => lengthAwareMatch(value, query));
};

function TableHeader({
  table,
  globalFilter,
  setGlobalFilter,
  clearSearch,
  inputRef
}: {
  readonly table: ReturnType<typeof useReactTable>;
  readonly globalFilter: string;
  readonly setGlobalFilter: (value: string) => void;
  readonly clearSearch: () => void;
  readonly inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div className="shrink-0 flex flex-col md:flex-row md:items-center gap-2 py-4 px-4">
      <div className="flex items-center gap-2">
        {/* https://tanstack.com/table/latest/docs/framework/react/examples/pagination */}
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
      {/* Global Search Input */}
      <div className="grow py-2 md:px-4">
        <div className="relative">
          <DebouncedInput
            ref={inputRef}
            setValue={setGlobalFilter}
            value={globalFilter}
          />
          {globalFilter ? (
            <button
              aria-label="Clear search"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-primary hover:text-primary/80 transition-colors"
              onClick={clearSearch}
              type="button"
            >
              <HiXMark className="h-5 w-5 font-bold" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TableRow({
  gridColsClass,
  children
}: {
  readonly gridColsClass: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      className={`grid ${gridColsClass} justify-items-start items-center gap-4 px-4 py-4 border-b border-surface last:border-0 items-start`}
    >
      {children}
    </div>
  );
}

function Table<TData>({
  columns,
  data,
  gridColsClass,
  loadingState,
  emptyText
}: TableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');
  const debounceMs = 350;
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const table = useReactTable({
    data,
    columns: columns as ColumnDef<unknown>[],
    state: {
      sorting,
      globalFilter
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel()
  });

  // Debounce the global filter updates
  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setGlobalFilter(inputValue.toLowerCase());
      table.firstPage(); // Reset to first page when searching
    }, debounceMs);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [inputValue, debounceMs, table]);

  const handleInputChange = useCallback((value: string): void => {
    setInputValue(value);
  }, []);

  const clearSearch = useCallback((): void => {
    setInputValue('');
    setGlobalFilter('');
    inputRef.current?.blur();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <TableHeader
        clearSearch={clearSearch}
        globalFilter={inputValue}
        inputRef={inputRef}
        setGlobalFilter={handleInputChange}
        table={table}
      />
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
        <div className="max-h-full" id="table-body">
          {table.getRowModel().rows.map(row => (
            <TableRow gridColsClass={gridColsClass} key={row.id}>
              {row.getVisibleCells().map(cell => (
                <Fragment key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Fragment>
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
  emptyText
}: TableProps<TData>) {
  return (
    <Card className="min-h-48">
      <Table
        columns={columns}
        data={data}
        emptyText={emptyText}
        gridColsClass={gridColsClass}
        loadingState={loadingState}
      />
    </Card>
  );
}

export { Table, TableRow, TableCard, SortIcons };
