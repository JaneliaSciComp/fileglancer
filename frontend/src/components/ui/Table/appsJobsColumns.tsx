import type { ColumnDef } from '@tanstack/react-table';

import DataLinksActionsMenu from '@/components/ui/Menus/DataLinksActions';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import JobStatusBadge from '@/components/ui/AppsPage/JobStatusBadge';
import { formatDateString } from '@/utils';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import type { Job } from '@/shared.types';

function formatDuration(job: Job): string {
  const start = job.started_at || job.created_at;
  const end = job.finished_at || new Date().toISOString();
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();

  if (diffMs < 0) {
    return '-';
  }

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

type JobActionCallbacks = {
  onViewDetail: (jobId: number) => void;
  onRelaunch: (job: Job) => void;
  onCancel: (jobId: number) => void;
  onDelete: (jobId: number) => void;
};

type JobRowActionProps = JobActionCallbacks & {
  job: Job;
};

export function createAppsJobsColumns(
  callbacks: JobActionCallbacks
): ColumnDef<Job>[] {
  return [
    {
      accessorKey: 'app_name',
      header: 'App',
      cell: ({ getValue, table }) => {
        const value = getValue() as string;
        const onContextMenu = table.options.meta?.onCellContextMenu;
        return (
          <div
            className="flex items-center truncate w-full h-full"
            onContextMenu={e => {
              e.preventDefault();
              onContextMenu?.(e, { value });
            }}
          >
            <FgTooltip label={value}>
              <span className="truncate">{value}</span>
            </FgTooltip>
          </div>
        );
      },
      enableSorting: true
    },
    {
      accessorKey: 'entry_point_name',
      header: 'Entry Point',
      cell: ({ getValue, row, table }) => {
        const value = getValue() as string;
        const jobId = row.original.id;
        const onContextMenu = table.options.meta?.onCellContextMenu;
        return (
          <div
            className="flex items-center truncate w-full h-full"
            onContextMenu={e => {
              e.preventDefault();
              onContextMenu?.(e, { value });
            }}
          >
            <button
              className="truncate text-primary hover:underline cursor-pointer text-left"
              onClick={() => callbacks.onViewDetail(jobId)}
              type="button"
            >
              {value}
            </button>
          </div>
        );
      },
      enableSorting: true
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const status = getValue() as Job['status'];
        return (
          <div className="flex items-center h-full">
            <JobStatusBadge status={status} />
          </div>
        );
      },
      enableSorting: true
    },
    {
      accessorKey: 'created_at',
      header: 'Submitted',
      cell: ({ getValue, table }) => {
        const value = getValue() as string;
        const formatted = formatDateString(value);
        const onContextMenu = table.options.meta?.onCellContextMenu;
        return (
          <div
            className="flex items-center truncate w-full h-full"
            onContextMenu={e => {
              e.preventDefault();
              onContextMenu?.(e, { value: formatted });
            }}
          >
            <span className="truncate text-sm">{formatted}</span>
          </div>
        );
      },
      enableSorting: true
    },
    {
      id: 'duration',
      header: 'Duration',
      cell: ({ row }) => {
        const duration = formatDuration(row.original);
        return (
          <div className="flex items-center h-full">
            <span className="text-sm">{duration}</span>
          </div>
        );
      },
      enableSorting: false
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const job = row.original;
        const canCancel = job.status === 'PENDING' || job.status === 'RUNNING';

        const menuItems: MenuItem<JobRowActionProps>[] = [
          {
            name: 'View Details',
            action: props => props.onViewDetail(props.job.id)
          },
          {
            name: 'Relaunch',
            action: props => props.onRelaunch(props.job)
          },
          {
            name: 'Cancel',
            action: props => props.onCancel(props.job.id),
            shouldShow: canCancel
          },
          {
            name: 'Delete',
            color: 'text-error',
            action: props => props.onDelete(props.job.id)
          }
        ];

        const actionProps: JobRowActionProps = {
          job,
          ...callbacks
        };

        return (
          <div className="flex items-center justify-end h-full">
            <DataLinksActionsMenu<JobRowActionProps>
              actionProps={actionProps}
              menuItems={menuItems}
            />
          </div>
        );
      },
      enableSorting: false
    }
  ];
}
