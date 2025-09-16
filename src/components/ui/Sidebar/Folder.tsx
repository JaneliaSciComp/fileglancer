import React from 'react';
import { default as log } from '@/logger';
import { Link } from 'react-router-dom';
import { IconButton, List, Typography } from '@material-tailwind/react';
import { HiOutlineFolder } from 'react-icons/hi2';
import { HiStar } from 'react-icons/hi';

import {
  makeMapKey,
  getFileBrowsePath,
  sendFetchRequest,
  getLastSegmentFromPath,
  getPreferredPathForDisplay,
  makeBrowseLink
} from '@/utils';
import { useCookiesContext } from '@/contexts/CookiesContext';
import MissingFolderFavoriteDialog from './MissingFolderFavoriteDialog';
import FgTooltip from '../widgets/FgTooltip';
import type { FileSharePath } from '@/shared.types';

import {
  FolderFavorite,
  usePreferencesContext
} from '@/contexts/PreferencesContext';
import toast from 'react-hot-toast';

type FolderProps = {
  readonly fsp: FileSharePath;
  readonly folderPath: string;
  readonly isFavoritable?: boolean;
  readonly icon?: React.ReactNode;
};

export default function Folder({
  fsp,
  folderPath,
  isFavoritable = true,
  icon
}: FolderProps) {
  const [showMissingFolderFavoriteDialog, setShowMissingFolderFavoriteDialog] =
    React.useState(false);
  const { pathPreference, handleFavoriteChange } = usePreferencesContext();
  const { cookies } = useCookiesContext();

  const folderFavorite = React.useMemo(() => {
    if (isFavoritable) {
      return {
        type: 'folder',
        folderPath,
        fsp
      } as FolderFavorite;
    }
  }, [folderPath, fsp, isFavoritable]);

  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    fsp,
    folderPath
  );

  const mapKey = makeMapKey('folder', `${fsp.name}_${folderPath}`) as string;

  const link = makeBrowseLink(fsp.name, folderPath);

  async function checkFavFolderExists() {
    if (!folderFavorite) {
      return;
    }
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
        className="pl-6 w-full flex gap-2 items-center justify-between rounded-md cursor-pointer text-foreground hover:bg-primary-light/30 focus:bg-primary-light/30 "
        key={mapKey}
        onClick={async () => {
          let folderExists;
          try {
            folderExists = await checkFavFolderExists();
          } catch (error) {
            log.error('Error checking folder existence:', error);
          }
          if (folderExists === false) {
            setShowMissingFolderFavoriteDialog(true);
          }
        }}
      >
        <Link
          className="w-[calc(100%-2rem)] flex flex-col items-start gap-2 short:gap-1 !text-foreground hover:!text-black focus:!text-black hover:dark:!text-white focus:dark:!text-white"
          to={link}
        >
          <div className="w-full flex gap-1 items-center">
            {icon || (
              <HiOutlineFolder className="icon-small short:icon-xsmall stroke-2" />
            )}
            <Typography className="w-[calc(100%-2rem)] truncate text-sm leading-4 short:text-xs font-semibold">
              {getLastSegmentFromPath(folderPath)}
            </Typography>
          </div>
          <FgTooltip label={displayPath} triggerClasses="w-full">
            <Typography className="text-left text-sm short:text-xs truncate">
              {displayPath}
            </Typography>
          </FgTooltip>
        </Link>
        {folderFavorite ? (
          <div
            onClick={e => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            <IconButton
              className="min-w-0 min-h-0"
              isCircular
              onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                const result = await handleFavoriteChange(
                  folderFavorite,
                  'folder'
                );
                if (result.success) {
                  toast.success(
                    `Favorite ${result.data === true ? 'added!' : 'removed!'}`
                  );
                } else {
                  toast.error(`Error adding favorite: ${result.error}`);
                }
              }}
              variant="ghost"
            >
              <HiStar className="icon-small short:icon-xsmall mb-[2px]" />
            </IconButton>
          </div>
        ) : null}
      </List.Item>
      {showMissingFolderFavoriteDialog && folderFavorite ? (
        <MissingFolderFavoriteDialog
          folderFavorite={folderFavorite}
          setShowMissingFolderFavoriteDialog={
            setShowMissingFolderFavoriteDialog
          }
          showMissingFolderFavoriteDialog={showMissingFolderFavoriteDialog}
        />
      ) : null}
    </>
  );
}
