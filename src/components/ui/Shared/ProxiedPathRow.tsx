import { Tooltip, Typography } from '@material-tailwind/react';

import SharingDialog from '@/components/ui/Dialogs/SharingDialog';
import SharedActionsMenu from '@/components/ui/Menus/SharedActions';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import useSharingDialog from '@/hooks/useSharingDialog';
import useProxiedPathRow from '@/hooks/useProxiedPathRow';
import {
  formatDateString,
  getPreferredPathForDisplay,
  makeMapKey
} from '@/utils';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import type { FileSharePath } from '@/shared.types';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';

type ProxiedPathRowProps = {
  item: ProxiedPath;
};

type ProxiedPathRowActionProps = {
  handleCopyPath: (path: string) => void;
  handleCopyUrl: (item: ProxiedPath) => void;
  handleUnshare: (pathFsp: FileSharePath) => void;
  item: ProxiedPath;
  displayPath: string;
  pathFsp: FileSharePath | undefined;
};

export default function ProxiedPathRow({ item }: ProxiedPathRowProps) {
  const { pathPreference } = usePreferencesContext();
  const { zonesAndFileSharePathsMap } = useZoneAndFspMapContext();

  const { showSharingDialog, setShowSharingDialog } = useSharingDialog();
  const {
    handleCopyPath,
    handleCopyUrl,
    handleUnshare,
    handleRowClick,
    handleNameClick
  } = useProxiedPathRow({item, setShowSharingDialog});


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
      action: (props: ProxiedPathRowActionProps) =>
        props.handleCopyPath(props.displayPath)
    },
    {
      name: 'Copy sharing link (S3-compatible URL)',
      action: (props: ProxiedPathRowActionProps) =>
        props.handleCopyUrl(props.item)
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
        className="grid grid-cols-[1.5fr_2.5fr_1.5fr_1fr] gap-4 items-center px-4 py-3 border-b last:border-b-0 border-surface hover:bg-primary-light/20 relative cursor-pointer"
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
          <SharedActionsMenu<ProxiedPathRowActionProps>
            menuItems={menuItems}
            actionProps={actionProps}
          />
        </div>
      </div>
      {/* Sharing dialog */}
      {showSharingDialog ? (
        <SharingDialog
          isImageShared={true}
          filePathWithoutFsp={item.path}
          showSharingDialog={showSharingDialog}
          setShowSharingDialog={setShowSharingDialog}
          proxiedPath={item}
        />
      ) : null}
    </>
  );
}
