import { Typography } from '@material-tailwind/react';
import { type ColumnDef } from '@tanstack/react-table';

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

const FilePathCell = ({ item }: { readonly item: Ticket }) => {
  const { zonesAndFileSharePathsMap } = useZoneAndFspMapContext();
  const { pathPreference } = usePreferencesContext();

  const itemFsp = zonesAndFileSharePathsMap[
    makeMapKey('fsp', item.fsp_name)
  ] as FileSharePath;
  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    itemFsp,
    item.path
  );

  return (
    <div className="line-clamp-2 max-w-full">
      <FgStyledLink to={makeBrowseLink(item.fsp_name, item.path)}>
        {displayPath}
      </FgStyledLink>
    </div>
  );
};

const StatusCell = ({ status }: { readonly status: string }) => {
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
};

export const jobsColumns: ColumnDef<Ticket>[] = [
  {
    accessorKey: 'path',
    header: 'File Path',
    cell: ({ row }) => <FilePathCell item={row.original} />,
    enableSorting: true
  },
  {
    accessorKey: 'description',
    header: 'Job Description',
    cell: ({ getValue }) => (
      <Typography className="line-clamp-2 text-foreground max-w-full">
        {getValue() as string}
      </Typography>
    )
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <StatusCell status={getValue() as string} />,
    enableSorting: true
  },
  {
    accessorKey: 'updated',
    header: 'Last Updated',
    cell: ({ getValue }) => (
      <div className="text-sm text-foreground-muted">
        {formatDateString(getValue() as string)}
      </div>
    ),
    enableSorting: true
  }
];
