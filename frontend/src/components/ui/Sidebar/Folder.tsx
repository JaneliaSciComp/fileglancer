import { useState, useMemo, type ReactNode, type MouseEvent } from 'react';
import { default as log } from '@/logger';
import { Link } from 'react-router-dom';
import { IconButton, List, Typography } from '@material-tailwind/react';
import { HiOutlineFolder } from 'react-icons/hi2';
import { HiStar } from 'react-icons/hi';
import { useQueryClient } from '@tanstack/react-query';

import {
  makeMapKey,
  getLastSegmentFromPath,
  getPreferredPathForDisplay,
  makeBrowseLink,
  buildApiUrl
} from '@/utils';
import MissingFolderFavoriteDialog from './MissingFolderFavoriteDialog';
import FgTooltip from '../widgets/FgTooltip';
import type { FileSharePath } from '@/shared.types';
import { fileQueryKeys } from '@/queries/fileQueries';

import {
  FolderFavorite,
  usePreferencesContext
} from '@/contexts/PreferencesContext';
import toast from 'react-hot-toast';

type FolderProps = {
  readonly fsp: FileSharePath;
  readonly folderPath: string;
  readonly isFavoritable?: boolean;
  readonly icon?: ReactNode;
};

export default function Folder({
  fsp,
  folderPath,
  isFavoritable = true,
  icon
}: FolderProps) {
  const [showMissingFolderFavoriteDialog, setShowMissingFolderFavoriteDialog] =
    useState(false);
  const { pathPreference, handleFavoriteChange } = usePreferencesContext();
  const queryClient = useQueryClient();

  const folderFavorite = useMemo(() => {
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

  if (!fsp) {
    return null;
  }

  const mapKey = makeMapKey('folder', `${fsp.name}_${folderPath}`) as string;

  const link = makeBrowseLink(fsp.name, folderPath);

  async function checkFavFolderExists() {
    if (!folderFavorite || !isFavoritable) {
      return true; // If not favoritable, assume it exists (skip check)
    }
    try {
      // Use queryClient.fetchQuery to check if folder exists
      // This leverages the existing query infrastructure and caching
      const url = buildApiUrl('/api/files/', [fsp.name], {
        subpath: folderPath
      });
      await queryClient.fetchQuery({
        queryKey: fileQueryKeys.filePath(fsp.name, folderPath),
        queryFn: async () => {
          const response = await fetch(url);
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error('Folder not found');
            }
            // For other errors, throw generic error
            throw new Error(`Error checking folder: ${response.status}`);
          }
          return response.json();
        },
        retry: false, // Don't retry on 404
        staleTime: 0 // Always fetch fresh data for this check
      });

      // If fetchQuery succeeds, folder exists
      return true;
    } catch (error) {
      // Check if it's a 404 error (folder doesn't exist)
      if (error instanceof Error && error.message === 'Folder not found') {
        return false;
      }
      // For other errors (403, network issues, etc.), log and assume it exists
      // to avoid false positives (better to navigate and show real error)
      log.error('Error checking folder existence:', error);
      return true; // Changed from false to true to avoid false positives
    }
  }

  return (
    <>
      <List.Item
        className="group pl-6 w-full flex gap-2 items-center justify-between rounded-md cursor-pointer text-foreground hover:bg-primary-light/30 focus:bg-primary-light/30 "
        key={mapKey}
        onClick={
          isFavoritable
            ? async () => {
                let folderExists;
                try {
                  folderExists = await checkFavFolderExists();
                } catch (error) {
                  log.error('Error checking folder existence:', error);
                }
                if (folderExists === false) {
                  setShowMissingFolderFavoriteDialog(true);
                }
              }
            : undefined
        }
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
            <Typography
              className={`text-left text-sm short:text-xs truncate ${isFavoritable ? '' : 'text-foreground/60 group-hover:text-black group-hover:dark:text-white'}`}
            >
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
              onClick={async (e: MouseEvent<HTMLButtonElement>) => {
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
