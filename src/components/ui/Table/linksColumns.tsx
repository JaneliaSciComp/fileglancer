import { Typography } from '@material-tailwind/react';
import { type ColumnDef } from '@tanstack/react-table';
import toast from 'react-hot-toast';

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
import useDataLinkDialog from '@/hooks/useDataLinkDialog';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import type { FileSharePath, Result } from '@/shared.types';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import { FgStyledLink } from '../widgets/FgLink';
import FgTooltip from '../widgets/FgTooltip';

type ProxiedPathRowActionProps = {
  handleCopyPath: (path: string) => Promise<Result<void>>;
  handleCopyUrl: (item: ProxiedPath) => Promise<Result<void>>;
  handleUnshare: () => void;
  item: ProxiedPath;
  displayPath: string;
  pathFsp: FileSharePath | undefined;
};

function PathCell({ item }: { item: ProxiedPath }) {
  const { pathPreference } = usePreferencesContext();
  const { zonesAndFileSharePathsMap } = useZoneAndFspMapContext();
  const tooltipTriggerClasses = 'max-w-full truncate';

  const pathFsp = zonesAndFileSharePathsMap[
    makeMapKey('fsp', item.fsp_name)
  ] as FileSharePath;

  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    pathFsp,
    item.path
  );

  const browseLink = makeBrowseLink(item.fsp_name, item.path);

  return (
    <div className="min-w-0 max-w-full">
      <FgTooltip label={displayPath} triggerClasses={tooltipTriggerClasses}>
        <Typography
          as={FgStyledLink}
          to={browseLink}
          className="text-left truncate block"
        >
          {displayPath}
        </Typography>
      </FgTooltip>
    </div>
  );
}

function ActionsCell({ item }: { item: ProxiedPath }) {
  const { showDataLinkDialog, setShowDataLinkDialog } = useDataLinkDialog();
  const { pathPreference } = usePreferencesContext();
  const { zonesAndFileSharePathsMap } = useZoneAndFspMapContext();

  const { handleCopyPath, handleCopyUrl, handleUnshare } = useProxiedPathRow({
    setShowDataLinkDialog
  });

  const pathFsp = zonesAndFileSharePathsMap[
    makeMapKey('fsp', item.fsp_name)
  ] as FileSharePath;

  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    pathFsp,
    item.path
  );

  const menuItems: MenuItem<ProxiedPathRowActionProps>[] = [
    {
      name: 'Copy path',
      action: async (props: ProxiedPathRowActionProps) => {
        const result = await props.handleCopyPath(props.displayPath);
        if (result.success) {
          toast.success('Path copied!');
        } else {
          toast.error(`Error copying path: ${result.error}`);
        }
      }
    },
    {
      name: 'Copy sharing link (S3-compatible URL)',
      action: async (props: ProxiedPathRowActionProps) => {
        const result = await props.handleCopyUrl(props.item);
        if (result.success) {
          toast.success('Sharing link copied!');
        } else {
          toast.error(`Error copying sharing link: ${result.error}`);
        }
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
    <div className="min-w-0">
      <div onClick={e => e.stopPropagation()}>
        <DataLinksActionsMenu<ProxiedPathRowActionProps>
          menuItems={menuItems}
          actionProps={actionProps}
        />
      </div>
      {/* Sharing dialog */}
      {showDataLinkDialog ? (
        <DataLinkDialog
          isImageShared={true}
          showDataLinkDialog={showDataLinkDialog}
          setShowDataLinkDialog={setShowDataLinkDialog}
          proxiedPath={item}
        />
      ) : null}
    </div>
  );
}

const tooltipTriggerClasses = 'max-w-full truncate';

export const linksColumns: ColumnDef<ProxiedPath>[] = [
  {
    accessorKey: 'sharing_name',
    header: 'Name',
    cell: ({ row }) => {
      const item = row.original;
      return (
        <div className="min-w-0 max-w-full">
          <FgTooltip
            label={item.sharing_name}
            triggerClasses={tooltipTriggerClasses}
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
    accessorKey: 'path',
    header: 'File Path',
    cell: ({ row }) => <PathCell item={row.original} />,
    enableSorting: true
  },
  {
    accessorKey: 'created_at',
    header: 'Date Created',
    cell: ({ getValue }) => {
      const dateString = getValue() as string;
      return (
        <div className="min-w-0 max-w-full">
          <FgTooltip
            label={formatDateString(dateString)}
            triggerClasses={tooltipTriggerClasses}
          >
            <Typography
              variant="small"
              className="text-left text-foreground truncate"
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
    cell: ({ getValue }) => {
      const key = getValue() as string;
      return (
        <div className="min-w-0 max-w-full">
          <FgTooltip label={key} triggerClasses={tooltipTriggerClasses}>
            <Typography className="text-foreground truncate">{key}</Typography>
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
];
