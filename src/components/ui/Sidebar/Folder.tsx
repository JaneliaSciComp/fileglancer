import React from 'react';
import { Link } from 'react-router-dom';
import {
  IconButton,
  List,
  Tooltip,
  Typography
} from '@material-tailwind/react';
import { FolderIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarFilled } from '@heroicons/react/24/solid';

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
  const {
    handleFileBrowserNavigation,
    currentFileOrFolder,
    currentFileSharePath,
    setCurrentFileSharePath
  } = useFileBrowserContext();
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
      console.error('Error checking folder existence:', error);
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
            console.error('Error checking folder existence:', error);
          }
          if (folderExists) {
            setOpenZones({
              all: true,
              [folderFavorite.fsp.zone]: true
            });
            setCurrentFileSharePath(folderFavorite.fsp);
            await handleFileBrowserNavigation({
              fspName: folderFavorite.fsp.name,
              path: folderFavorite.folderPath
            });
          } else if (folderExists === false) {
            setShowMissingFolderFavoriteDialog(true);
          }
        }}
        className={`x-short:py-0 flex gap-2 items-center justify-between rounded-none cursor-pointer text-foreground hover:bg-primary-light/30 focus:bg-primary-light/30 ${folderFavorite.fsp === currentFileSharePath && folderFavorite.fsp.name === currentFileOrFolder?.name ? '!bg-primary-light/30' : '!bg-background'}`}
      >
        <Link
          to="/browse"
          className="w-[calc(100%-4rem)] flex flex-col items-start gap-2 x-short:gap-1 !text-foreground hover:!text-black focus:!text-black hover:dark:!text-white focus:dark:!text-white"
        >
          <div className="w-full flex gap-1 items-center">
            <FolderIcon className="icon-small x-short:icon-xsmall" />
            <Typography className="w-[calc(100%-2rem)] truncate text-sm font-medium leading-4 x-short:text-xs">
              {getLastSegmentFromPath(folderFavorite.folderPath)}
            </Typography>
          </div>
          <Tooltip placement="right">
            <Tooltip.Trigger className="w-full">
              <Typography className="text-left text-xs truncate">
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
            variant="ghost"
            isCircular
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              e.stopPropagation();
              handleFavoriteChange(folderFavorite, 'folder');
            }}
          >
            <StarFilled className="icon-small x-short:icon-xsmall mb-[2px]" />
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
