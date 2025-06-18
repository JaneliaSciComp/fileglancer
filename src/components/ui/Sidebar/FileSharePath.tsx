import React from 'react';
import { Link } from 'react-router';
import { List, Typography, IconButton } from '@material-tailwind/react';
import {
  RectangleStackIcon,
  StarIcon as StarOutline
} from '@heroicons/react/24/outline';
import { StarIcon as StarFilled } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';

import type { FileSharePath } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { makeMapKey, getPreferredPathForDisplay } from '@/utils';

type FileSharePathComponentProps = {
  fsp: FileSharePath;
  index: number;
};

export default function FileSharePathComponent({
  fsp,
  index
}: FileSharePathComponentProps) {
  const { pathPreference, fileSharePathPreferenceMap, handleFavoriteChange } =
    usePreferencesContext();

  const { handleFileBrowserNavigation, setCurrentFileSharePath } =
    useFileBrowserContext();

  const isFavoritePath = fileSharePathPreferenceMap[makeMapKey('fsp', fsp.name)]
    ? true
    : false;
  const fspPath = getPreferredPathForDisplay(pathPreference, fsp);

  return (
    <List.Item
      onClick={async () => {
        setCurrentFileSharePath(fsp);
        const result = await handleFileBrowserNavigation({ fspName: fsp.name });
        if (result.error) {
          toast.error(`File browser navigation failed: ${result.error}`);
          return;
        }
      }}
      className="file-share-path pl-6 w-full flex items-center justify-between rounded-md cursor-pointer text-foreground hover:!bg-primary-light/30 focus:!bg-primary-light/30"
    >
      <Link
        to="/browse"
        className="max-w-[calc(100%-1rem)] grow flex flex-col gap-1 !text-foreground hover:!text-black focus:!text-black dark:hover:!text-white dark:focus:!text-white"
      >
        <div className="flex gap-1 items-center max-w-full">
          <RectangleStackIcon className="icon-small short:icon-xsmall stroke-2" />
          <Typography className="truncate text-sm leading-4 short:text-xs font-semibold">
            {fsp.storage}
          </Typography>
        </div>

        <Typography className="text-sm short:text-xs truncate max-w-full">
          {fspPath}
        </Typography>
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
          onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            const result = await handleFavoriteChange(fsp, 'fileSharePath');
            if (!result.success) {
              toast.error(`Failed to update favorites: ${result.error}`);
            }
          }}
        >
          {isFavoritePath ? (
            <StarFilled className="icon-small short:icon-xsmall mb-[2px]" />
          ) : (
            <StarOutline className="icon-small short:icon-xsmall mb-[2px]" />
          )}
        </IconButton>
      </div>
    </List.Item>
  );
}
