import { Typography } from '@material-tailwind/react';
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

type ProxiedPathRowProps = {
  item: ProxiedPath;
};

type ProxiedPathRowActionProps = {
  handleCopyPath: (path: string) => Promise<Result<void>>;
  handleCopyUrl: (item: ProxiedPath) => Promise<Result<void>>;
  handleUnshare: () => void;
  item: ProxiedPath;
  displayPath: string;
  pathFsp: FileSharePath | undefined;
};

export default function ProxiedPathRow({ item }: ProxiedPathRowProps) {
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

  const browseLink = makeBrowseLink(item.fsp_name, item.path);

  const tooltipTriggerClasses = 'max-w-full truncate';

  return (
    <>
      {/* Sharing name */}
      <FgTooltip
        label={item.sharing_name}
        triggerClasses={tooltipTriggerClasses}
      >
        <Typography className="text-foreground truncate">
          {item.sharing_name}
        </Typography>
      </FgTooltip>

      {/* Mount path */}
      <FgTooltip label={displayPath} triggerClasses={tooltipTriggerClasses}>
        <Typography
          as={FgStyledLink}
          to={browseLink}
          className="text-left truncate"
        >
          {displayPath}
        </Typography>
      </FgTooltip>

      {/* Date shared */}
      <FgTooltip
        label={formatDateString(item.created_at)}
        triggerClasses={tooltipTriggerClasses}
      >
        <Typography
          variant="small"
          className="text-left text-foreground truncate"
        >
          {formatDateString(item.created_at)}
        </Typography>
      </FgTooltip>

      {/* Actions */}
      <div onClick={e => e.stopPropagation()}>
        <DataLinksActionsMenu<ProxiedPathRowActionProps>
          menuItems={menuItems}
          actionProps={actionProps}
        />
      </div>
      {/* Sharing dialog */}
      {showDataLinkDialog ? (
        <DataLinkDialog
          action="delete"
          showDataLinkDialog={showDataLinkDialog}
          setShowDataLinkDialog={setShowDataLinkDialog}
          proxiedPath={item}
        />
      ) : null}
    </>
  );
}
