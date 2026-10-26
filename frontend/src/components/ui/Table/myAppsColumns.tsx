import type { MouseEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgLink from '@/components/designSystem/atoms/FgLink';
import CardActionsMenu from '@/components/ui/Menus/CardActionsMenu';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import SharedBadge from '@/components/ui/AppsPage/SharedBadge';
import {
  buildAppMenuItems,
  isAppShared
} from '@/components/ui/AppsPage/appMenuItems';
import {
  appRevision,
  buildAppDetailPath,
  getAppIconType,
  repoLabel
} from '@/utils';
import type { AppActions } from '@/hooks/useAppActions';
import type { UserApp } from '@/shared.types';

type OnCellContextMenu = (
  e: MouseEvent<HTMLElement>,
  data: { value: string }
) => void;

function NameCell({
  app,
  onContextMenu
}: {
  readonly app: UserApp;
  readonly onContextMenu?: OnCellContextMenu;
}) {
  let detailPath: string | null = null;
  try {
    detailPath = buildAppDetailPath(app.url, app.manifest_path);
  } catch {
    detailPath = null;
  }
  return (
    <div
      className="flex items-center gap-2 min-w-0 truncate w-full h-full"
      onContextMenu={e => {
        e.preventDefault();
        onContextMenu?.(e, { value: app.name });
      }}
    >
      <FgIcon
        className="text-foreground flex-shrink-0"
        icon={getAppIconType()}
      />
      {detailPath ? (
        <FgLink className="truncate min-w-0" to={detailPath}>
          {app.name}
        </FgLink>
      ) : (
        <span className="truncate">{app.name}</span>
      )}
    </div>
  );
}

export function createMyAppsColumns(actions: AppActions): ColumnDef<UserApp>[] {
  return [
    {
      id: 'repository',
      accessorFn: row => repoLabel(row.url),
      header: 'Repository',
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
            <FgTooltip label={value} triggerClasses="max-w-full truncate">
              <span className="truncate text-sm">{value}</span>
            </FgTooltip>
          </div>
        );
      },
      enableSorting: true
    },
    {
      id: 'revision',
      accessorFn: row => appRevision(row.url, row.branch) ?? '',
      header: 'Revision',
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
            <span className="truncate text-sm">{value}</span>
          </div>
        );
      },
      enableSorting: true
    },
    {
      accessorKey: 'name',
      header: 'App Name',
      cell: ({ row, table }) => (
        <NameCell
          app={row.original}
          onContextMenu={table.options.meta?.onCellContextMenu}
        />
      ),
      enableSorting: true
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ getValue, table }) => {
        const value = (getValue() as string | undefined) ?? '';
        const onContextMenu = table.options.meta?.onCellContextMenu;
        return (
          <div
            className="flex items-center truncate w-full h-full"
            onContextMenu={e => {
              e.preventDefault();
              onContextMenu?.(e, { value });
            }}
          >
            {value ? (
              <FgTooltip label={value} triggerClasses="max-w-full truncate">
                <span className="truncate text-sm">{value}</span>
              </FgTooltip>
            ) : null}
          </div>
        );
      },
      enableSorting: true
    },
    {
      id: 'status',
      accessorFn: row => (isAppShared(row) ? 'Shared' : ''),
      header: 'Status',
      cell: ({ row }) => (
        <div className="flex items-center h-full">
          {isAppShared(row.original) ? <SharedBadge /> : null}
        </div>
      ),
      enableSorting: true
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => {
        const app = row.original;
        return (
          <div className="flex items-center justify-end h-full">
            <CardActionsMenu<UserApp>
              actionProps={app}
              menuItems={buildAppMenuItems(app, actions)}
            />
          </div>
        );
      },
      enableSorting: false
    }
  ];
}
