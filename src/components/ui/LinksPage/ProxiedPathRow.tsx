import { Tooltip, Typography } from '@material-tailwind/react';

import DataLinkDialog from '@/components/ui/Dialogs/DataLink';
import DataLinksActionsMenu from '@/components/ui/Menus/DataLinksActions';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import useProxiedPathRow from '@/hooks/useProxiedPathRow';
import {
  formatDateString,
  getPreferredPathForDisplay,
  makeMapKey
} from '@/utils';
import useDataLinkDialog from '@/hooks/useDataLinkDialog';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import type { FileSharePath, Result } from '@/shared.types';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import toast from 'react-hot-toast';

type ProxiedPathRowProps = {
  item: ProxiedPath;
};

type ProxiedPathRowActionProps = {
  handleCopyPath: (path: string) => Promise<Result<void>>;
  handleCopyUrl: (item: ProxiedPath) => Promise<Result<void>>;
  handleUnshare: (pathFsp: FileSharePath) => void;
  item: ProxiedPath;
  displayPath: string;
  pathFsp: FileSharePath | undefined;
};

export default function ProxiedPathRow({ item }: ProxiedPathRowProps) {
  const { showDataLinkDialog, setShowDataLinkDialog } = useDataLinkDialog();
  const { pathPreference } = usePreferencesContext();
  const { zonesAndFileSharePathsMap } = useZoneAndFspMapContext();

  const {
    handleCopyPath,
    handleCopyUrl,
    handleUnshare,
    handleRowClick,
    handleNameClick
  } = useProxiedPathRow({ item, setShowDataLinkDialog });

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
      action: (props: ProxiedPathRowActionProps) =>
        props.handleUnshare(props.pathFsp as FileSharePath),
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
    <>
      <div
        key={item.sharing_key}
        className="grid grid-cols-[1.5fr_2.5fr_1.5fr_1fr] gap-4 items-center px-4 py-3 border-b last:border-b-0 border-surface hover:bg-primary-light/20 relative cursor-pointer hover:bg-surface-light"
        onClick={handleRowClick}
      >
        {/* Sharing name */}
        <Tooltip>
          <Tooltip.Trigger className="max-w-full truncate">
            <Typography
              variant="small"
              className="text-left text-primary-light truncate hover:underline"
              onClick={handleNameClick}
            >
              {item.sharing_name}
            </Typography>
          </Tooltip.Trigger>
          <Tooltip.Content>{item.sharing_name}</Tooltip.Content>
        </Tooltip>
        {/* Mount path */}
        <Tooltip>
          <Tooltip.Trigger className="max-w-full truncate">
            <Typography
              variant="small"
              className="text-left text-foreground truncate"
            >
              {displayPath}
            </Typography>
          </Tooltip.Trigger>
          <Tooltip.Content>{displayPath}</Tooltip.Content>
        </Tooltip>
        {/* Date shared */}
        <Tooltip>
          <Tooltip.Trigger className="max-w-full truncate">
            <Typography
              variant="small"
              className="text-left text-foreground truncate"
            >
              {formatDateString(item.created_at)}
            </Typography>
          </Tooltip.Trigger>
          <Tooltip.Content>{formatDateString(item.created_at)}</Tooltip.Content>
        </Tooltip>
        {/* Actions */}
        <div onClick={e => e.stopPropagation()}>
          <DataLinksActionsMenu<ProxiedPathRowActionProps>
            menuItems={menuItems}
            actionProps={actionProps}
          />
        </div>
      </div>
      {/* Sharing dialog */}
      {showDataLinkDialog ? (
        <DataLinkDialog
          isImageShared={true}
          filePathWithoutFsp={item.path}
          showDataLinkDialog={showDataLinkDialog}
          setShowDataLinkDialog={setShowDataLinkDialog}
          proxiedPath={item}
        />
      ) : null}
    </>
  );
}
