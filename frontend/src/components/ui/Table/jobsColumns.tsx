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

function FilePathCell({ item }: { readonly item: Ticket }) {
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

  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
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
    <div className="line-clamp-2 max-w-full">
      <FgStyledLink
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
            ? 'bg-blue-200 text-blue-800'
            : status === 'Pending'
              ? 'bg-yellow-200 text-yellow-800'
              : status === 'Work in progress'
                ? 'bg-purple-200 text-purple-800'
                : status === 'Done'
                  ? 'bg-green-200 text-green-800'
                  : 'bg-gray-200 text-gray-800'
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
    cell: ({ cell, row }) => <FilePathCell item={row.original} key={cell.id} />,
    enableSorting: true
  },
  {
    accessorKey: 'description',
    header: 'Job Description',
    cell: ({ cell, getValue }) => (
      <Typography
        className="line-clamp-2 text-foreground max-w-full"
        key={cell.id}
      >
        {getValue() as string}
      </Typography>
    )
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ cell, getValue }) => (
      <StatusCell key={cell.id} status={getValue() as string} />
    ),
    enableSorting: true
  },
  {
    accessorKey: 'updated',
    header: 'Last Updated',
    cell: ({ cell, getValue }) => (
      <div className="text-sm text-foreground-muted" key={cell.id}>
        {formatDateString(getValue() as string)}
      </div>
    ),
    enableSorting: true
  }
];
