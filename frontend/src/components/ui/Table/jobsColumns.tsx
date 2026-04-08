import type { MouseEvent } from 'react';
import { Typography } from '@material-tailwind/react';
import { type ColumnDef } from '@tanstack/react-table';
import { useNavigate } from 'react-router';

import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import type { Ticket } from '@/contexts/TicketsContext';
import {
  formatDateString,
  getPreferredPathForDisplay,
  makeBrowseLink,
  makeMapKey
} from '@/utils';
import { FileSharePath } from '@/shared.types';
import { FgStyledLink } from '../widgets/FgLink';
import toast from 'react-hot-toast';

function FilePathCell({
  item,
  onContextMenu
}: {
  readonly item: Ticket;
  readonly onContextMenu?: (
    e: MouseEvent<HTMLElement>,
    data: { value: string }
  ) => void;
}) {
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const { pathPreference, setLayoutWithPropertiesOpen } =
    usePreferencesContext();

  const navigate = useNavigate();

  const itemFsp = zonesAndFspQuery.isSuccess
    ? (zonesAndFspQuery.data[makeMapKey('fsp', item.fsp_name)] as FileSharePath)
    : null;
  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    itemFsp,
    item.path
  );

  const handleClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const result = await setLayoutWithPropertiesOpen();
    if (!result.success) {
      toast.error(`Error opening properties for file: ${result.error}`);
      return;
    }
    navigate(makeBrowseLink(item.fsp_name, item.path), {
      state: { openConvertTab: true }
    });
  };

  return (
    <div
      className="flex items-center truncate w-full h-full"
      onContextMenu={e => {
        e.preventDefault();
        onContextMenu?.(e, { value: displayPath });
      }}
    >
      <FgStyledLink
        className="truncate"
        onClick={handleClick}
        to={makeBrowseLink(item.fsp_name, item.path)}
      >
        {displayPath}
      </FgStyledLink>
    </div>
  );
}

function StatusCell({ status }: { readonly status: string }) {
  return (
    <div className="text-sm">
      <span
        className={`px-2 py-1 rounded-full text-xs ${
          status === 'Open'
            ? 'bg-info-light text-info dark:bg-info-dark dark:text-info'
            : status === 'Pending'
              ? 'bg-warning-light text-warning dark:bg-warning-dark'
              : status === 'Work in progress'
                ? 'bg-secondary/10 text-secondary dark:bg-secondary-dark/30'
                : status === 'Done'
                  ? 'bg-success-light text-success dark:bg-success-dark'
                  : 'bg-surface text-surface-foreground'
        }`}
      >
        {status}
      </span>
    </div>
  );
}

export const jobsColumns: ColumnDef<Ticket>[] = [
  {
    accessorKey: 'path',
    header: 'File Path',
    cell: ({ cell, row, table }) => {
      const onContextMenu = table.options.meta?.onCellContextMenu;
      return (
        <FilePathCell
          item={row.original}
          key={cell.id}
          onContextMenu={onContextMenu}
        />
      );
    },
    enableSorting: true
  },
  {
    accessorKey: 'description',
    header: 'Job Description',
    cell: ({ cell, getValue, table }) => {
      const description = getValue() as string;
      const onContextMenu = table.options.meta?.onCellContextMenu;
      return (
        <div
          className="flex items-center truncate w-full h-full"
          onContextMenu={e => {
            e.preventDefault();
            onContextMenu?.(e, { value: description });
          }}
        >
          <Typography
            className="text-foreground max-w-full truncate select-all"
            key={cell.id}
          >
            {description}
          </Typography>
        </div>
      );
    }
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ cell, getValue, table }) => {
      const status = getValue() as string;
      const onContextMenu = table.options.meta?.onCellContextMenu;
      return (
        <div
          className="flex items-center w-full h-full"
          onContextMenu={e => {
            e.preventDefault();
            onContextMenu?.(e, { value: status });
          }}
        >
          <StatusCell key={cell.id} status={status} />
        </div>
      );
    },
    enableSorting: true
  },
  {
    accessorKey: 'updated',
    header: 'Last Updated',
    cell: ({ cell, getValue, table }) => {
      const dateString = getValue() as string;
      const formattedDate = formatDateString(dateString);
      const onContextMenu = table.options.meta?.onCellContextMenu;
      return (
        <div
          className="flex items-center justify-items-start truncate w-full h-full"
          key={cell.id}
          onContextMenu={e => {
            e.preventDefault();
            onContextMenu?.(e, { value: formattedDate });
          }}
        >
          <Typography
            className="text-left text-foreground truncate select-all"
            variant="small"
          >
            {formattedDate}
          </Typography>
        </div>
      );
    },
    enableSorting: true
  }
];
