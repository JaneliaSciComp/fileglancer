import React from 'react';
import { default as log } from '@/logger';
import { Link } from 'react-router-dom';
import {
  IconButton,
  List,
  Tooltip,
  Typography
} from '@material-tailwind/react';
import { FolderIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarFilled } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';

import {
  makeMapKey,
  getFileBrowsePath,
  sendFetchRequest,
  getLastSegmentFromPath,
  getPreferredPathForDisplay
} from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useCookiesContext } from '@/contexts/CookiesContext';
import MissingFolderFavoriteDialog from './MissingFolderFavoriteDialog';

import {
  FolderFavorite,
  usePreferencesContext
} from '@/contexts/PreferencesContext';

type FolderProps = {
  folderFavorite: FolderFavorite;
  setOpenZones: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
};

export default function Folder({ folderFavorite, setOpenZones }: FolderProps) {
  const [showMissingFolderFavoriteDialog, setShowMissingFolderFavoriteDialog] =
    React.useState(false);
  const { handleFileBrowserNavigation, setCurrentFileSharePath } =
    useFileBrowserContext();
  const { pathPreference, handleFavoriteChange } = usePreferencesContext();
  const { cookies } = useCookiesContext();

  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    folderFavorite.fsp,
    folderFavorite.folderPath
  );

  const mapKey = makeMapKey(
    'folder',
    `${folderFavorite.fsp.name}_${folderFavorite.folderPath}`
  ) as string;

  async function checkFolderExists(folderFavorite: FolderFavorite) {
    try {
      const fetchPath = getFileBrowsePath(
        folderFavorite.fsp.name,
        folderFavorite.folderPath
      );
      const response = await sendFetchRequest(
        fetchPath,
        'GET',
        cookies['_xsrf']
      );

      if (response.status === 200) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      log.error('Error checking folder existence:', error);
      return false;
    }
  }

  return (
    <>
      <List.Item
        key={mapKey}
        onClick={async () => {
          let folderExists;
          try {
            folderExists = await checkFolderExists(folderFavorite);
          } catch (error) {
            log.error('Error checking folder existence:', error);
          }
          if (folderExists) {
            setOpenZones({
              all: true,
              [folderFavorite.fsp.zone]: true
            });
            setCurrentFileSharePath(folderFavorite.fsp);
            const result = await handleFileBrowserNavigation({
              fspName: folderFavorite.fsp.name,
              path: folderFavorite.folderPath
            });
            if (result.error) {
              toast.error(`File browser navigation failed: ${result.error}`);
              return;
            }
          } else if (folderExists === false) {
            setShowMissingFolderFavoriteDialog(true);
          }
        }}
        className="pl-6 w-full flex gap-2 items-center justify-between rounded-md cursor-pointer text-foreground hover:bg-primary-light/30 focus:bg-primary-light/30 "
      >
        <Link
          to="/browse"
          className="w-[calc(100%-2rem)] flex flex-col items-start gap-2 short:gap-1 !text-foreground hover:!text-black focus:!text-black hover:dark:!text-white focus:dark:!text-white"
        >
          <div className="w-full flex gap-1 items-center">
            <FolderIcon className="icon-small short:icon-xsmall stroke-2" />
            <Typography className="w-[calc(100%-2rem)] truncate text-sm leading-4 short:text-xs font-semibold">
              {getLastSegmentFromPath(folderFavorite.folderPath)}
            </Typography>
          </div>
          <Tooltip placement="right">
            <Tooltip.Trigger className="w-full">
              <Typography className="text-left text-sm short:text-xs truncate">
                {displayPath}
              </Typography>
            </Tooltip.Trigger>
            <Tooltip.Content>{displayPath}</Tooltip.Content>
          </Tooltip>
        </Link>
        <div
          onClick={e => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          <IconButton
            className="min-w-0 min-h-0"
            variant="ghost"
            isCircular
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              handleFavoriteChange(folderFavorite, 'folder');
            }}
          >
            <StarFilled className="icon-small short:icon-xsmall mb-[2px]" />
          </IconButton>
        </div>
      </List.Item>
      {showMissingFolderFavoriteDialog ? (
        <MissingFolderFavoriteDialog
          folderFavorite={folderFavorite}
          showMissingFolderFavoriteDialog={showMissingFolderFavoriteDialog}
          setShowMissingFolderFavoriteDialog={
            setShowMissingFolderFavoriteDialog
          }
        />
      ) : null}
    </>
  );
}
