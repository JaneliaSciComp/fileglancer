import {
  IconButton,
  Menu,
  Tooltip,
  Typography
} from '@material-tailwind/react';
import { HiOutlineEllipsisHorizontalCircle } from 'react-icons/hi2';
import { useNavigate } from 'react-router';
import logger from '@/logger';
import toast from 'react-hot-toast';

import SharingDialog from '@/components/ui/Dialogs/Sharing';
import type { FileSharePath } from '@/shared.types';
import {
  formatDateString,
  getPreferredPathForDisplay,
  makeMapKey,
  makeBrowseLink
} from '@/utils';
import { copyToClipboard } from '@/utils/copyText';
import useSharingDialog from '@/hooks/useSharingDialog';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';

type ProxiedPathRowProps = {
  item: ProxiedPath;
  menuOpenId: string | null;
  setMenuOpenId: (id: string | null) => void;
};

export default function ProxiedPathRow({ item }: ProxiedPathRowProps) {
  const { showSharingDialog, setShowSharingDialog } = useSharingDialog();
  const { pathPreference } = usePreferencesContext();
  const { zonesAndFileSharePathsMap } = useZoneAndFspMapContext();
  const navigate = useNavigate();

  const pathFsp = zonesAndFileSharePathsMap[
    makeMapKey('fsp', item.fsp_name)
  ] as FileSharePath;
  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    pathFsp,
    item.path
  );

  // Create navigation link for the file browser
  const browseLink = makeBrowseLink(item.fsp_name, item.path);

  const handleCopyPath = async () => {
    try {
      await copyToClipboard(displayPath);
      toast.success('Path copied to clipboard');
    } catch (error) {
      logger.error('Failed to copy path:', error);
      toast.error('Failed to copy path');
    }
  };

  const handleCopyUrl = async () => {
    try {
      await copyToClipboard(item.url);
      toast.success('URL copied to clipboard');
    } catch (error) {
      logger.error('Failed to copy sharing URL:', error);
      toast.error('Failed to copy URL');
    }
  };

  const handleRowClick = () => {
    navigate(browseLink);
  };

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(browseLink);
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
        <Menu>
          <Menu.Trigger
            as={IconButton}
            variant="ghost"
            className="p-1 max-w-fit"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <HiOutlineEllipsisHorizontalCircle className="icon-default text-foreground" />
          </Menu.Trigger>
          <Menu.Content className="menu-content">
            <Menu.Item className="menu-item">
              <Typography
                className="text-sm p-1 cursor-pointer text-secondary-light"
                onClick={handleCopyPath}
              >
                Copy path
              </Typography>
            </Menu.Item>
            <Menu.Item className="menu-item">
              <Typography
                className="text-sm p-1 cursor-pointer text-secondary-light"
                onClick={handleCopyUrl}
              >
                Copy sharing link (S3-compatible URL)
              </Typography>
            </Menu.Item>
            <Menu.Item>
              <Typography
                className="text-sm p-1 cursor-pointer text-red-600"
                onClick={() => {
                  setShowSharingDialog(true);
                }}
              >
                Unshare
              </Typography>
            </Menu.Item>
          </Menu.Content>
        </Menu>
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
