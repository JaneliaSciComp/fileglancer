import { useState, useMemo } from 'react';
import { Typography } from '@material-tailwind/react';
import type { ColumnDef } from '@tanstack/react-table';

import DataLinkDialog from '@/components/ui/Dialogs/DataLink';
import DataLinksActionsMenu from '@/components/ui/Menus/DataLinksActions';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import useProxiedPathRow from '@/hooks/useProxiedPathRow';
import {
  formatDateString,
  getPreferredPathForDisplay,
  makeMapKey,
  makeBrowseLink
} from '@/utils';
import useDataToolLinks from '@/hooks/useDataToolLinks';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import type { FileSharePath } from '@/shared.types';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import { FgStyledLink } from '../widgets/FgLink';
import FgTooltip from '../widgets/FgTooltip';

type ProxiedPathRowActionProps = {
  handleCopyPath: (path: string) => Promise<void>;
  handleCopyUrl: (item: ProxiedPath) => Promise<void>;
  handleUnshare: () => void;
  item: ProxiedPath;
  displayPath: string;
  pathFsp: FileSharePath | undefined;
};

const TRIGGER_CLASSES = 'max-w-full truncate';

function PathCell({
  item,
  displayPath
}: {
  readonly item: ProxiedPath;
  readonly displayPath: string;
}) {
  const browseLink = makeBrowseLink(item.fsp_name, item.path);

  return (
    <div className="min-w-0 max-w-full flex" key={`path-${item.sharing_key}`}>
      <FgTooltip label={displayPath} triggerClasses={TRIGGER_CLASSES}>
        <Typography
          as={FgStyledLink}
          className="text-left truncate block"
          to={browseLink}
        >
          {displayPath}
        </Typography>
      </FgTooltip>
    </div>
  );
}

function ActionsCell({ item }: { readonly item: ProxiedPath }) {
  const [showDataLinkDialog, setShowDataLinkDialog] = useState<boolean>(false);
  const { handleDeleteDataLink } = useDataToolLinks(setShowDataLinkDialog);
  const { pathPreference } = usePreferencesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  const { handleCopyPath, handleCopyUrl, handleUnshare } = useProxiedPathRow({
    setShowDataLinkDialog
  });

  const pathFsp = zonesAndFspQuery.isSuccess
    ? (zonesAndFspQuery.data[makeMapKey('fsp', item.fsp_name)] as FileSharePath)
    : undefined;

  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    pathFsp,
    item.path
  );

  const menuItems: MenuItem<ProxiedPathRowActionProps>[] = [
    {
      name: 'Copy path',
      action: async (props: ProxiedPathRowActionProps) => {
        await props.handleCopyPath(props.displayPath);
      }
    },
    {
      name: 'Copy sharing link (S3-compatible URL)',
      action: async (props: ProxiedPathRowActionProps) => {
        await props.handleCopyUrl(props.item);
      }
    },
    {
      name: 'Unshare',
      action: (props: ProxiedPathRowActionProps) => props.handleUnshare(),
      color: 'text-red-600'
    }
  ];

  const actionProps = {
    handleCopyPath,
    handleCopyUrl,
    handleUnshare,
    item,
    displayPath,
    pathFsp
  };

  return (
    <div
      className="min-w-0 flex"
      data-testid="data-link-actions-cell"
      key={`action-${item.sharing_key}`}
    >
      <div onClick={e => e.stopPropagation()}>
        <DataLinksActionsMenu<ProxiedPathRowActionProps>
          actionProps={actionProps}
          menuItems={menuItems}
        />
      </div>
      {/* Sharing dialog */}
      {showDataLinkDialog ? (
        <DataLinkDialog
          action="delete"
          handleDeleteDataLink={handleDeleteDataLink}
          proxiedPath={item}
          setShowDataLinkDialog={setShowDataLinkDialog}
          showDataLinkDialog={showDataLinkDialog}
        />
      ) : null}
    </div>
  );
}

export function useLinksColumns(): ColumnDef<ProxiedPath>[] {
  const { pathPreference } = usePreferencesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  return useMemo(
    () => [
      {
        accessorKey: 'sharing_name',
        header: 'Name',
        cell: ({ cell, row }) => {
          const item = row.original;
          return (
            <div className="flex min-w-0 max-w-full" key={cell.id}>
              <FgTooltip
                label={item.sharing_name}
                triggerClasses={TRIGGER_CLASSES}
              >
                <Typography className="text-foreground truncate">
                  {item.sharing_name}
                </Typography>
              </FgTooltip>
            </div>
          );
        },
        enableSorting: true
      },
      {
        id: 'path',
        header: 'File Path',
        accessorFn: (row: ProxiedPath) => {
          const pathFsp = zonesAndFspQuery.isSuccess
            ? (zonesAndFspQuery.data[
                makeMapKey('fsp', row.fsp_name)
              ] as FileSharePath)
            : undefined;
          return getPreferredPathForDisplay(pathPreference, pathFsp, row.path);
        },
        cell: ({ row, getValue }) => (
          <PathCell displayPath={getValue() as string} item={row.original} />
        ),
        enableSorting: true
      },
      {
        accessorKey: 'created_at',
        header: 'Date Created',
        cell: ({ cell, getValue }) => {
          const dateString = getValue() as string;
          return (
            <div className="flex min-w-0 max-w-full" key={cell.id}>
              <FgTooltip
                label={formatDateString(dateString)}
                triggerClasses={TRIGGER_CLASSES}
              >
                <Typography
                  className="text-left text-foreground truncate"
                  variant="small"
                >
                  {formatDateString(dateString)}
                </Typography>
              </FgTooltip>
            </div>
          );
        },
        enableSorting: true
      },
      {
        accessorKey: 'sharing_key',
        header: 'Key',
        cell: ({ cell, getValue }) => {
          const key = getValue() as string;
          return (
            <div className="flex min-w-0 max-w-full" key={cell.id}>
              <FgTooltip label={key} triggerClasses={TRIGGER_CLASSES}>
                <Typography className="text-foreground truncate">
                  {key}
                </Typography>
              </FgTooltip>
            </div>
          );
        },
        enableSorting: true
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => <ActionsCell item={row.original} />,
        enableSorting: false
      }
    ],
    [pathPreference, zonesAndFspQuery.data, zonesAndFspQuery.isSuccess]
  );
}
