import React from 'react';
import { Link } from 'react-router';
import { List, Typography, IconButton } from '@material-tailwind/react';
import {
  RectangleStackIcon,
  StarIcon as StarOutline
} from '@heroicons/react/24/outline';
import { StarIcon as StarFilled } from '@heroicons/react/24/solid';

import type { FileSharePath } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import {
  makeMapKey,
  convertPathToWindowsStyle,
  getPreferredPathForDisplay
} from '@/utils';

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

  const {
    handleFileBrowserNavigation,
    currentFileSharePath,
    setCurrentFileSharePath
  } = useFileBrowserContext();

  const isCurrentPath = currentFileSharePath?.name === fsp.name;
  const isFavoritePath = fileSharePathPreferenceMap[makeMapKey('fsp', fsp.name)]
    ? true
    : false;
  const fspPath = getPreferredPathForDisplay(pathPreference, fsp);

  return (
    <List.Item
      onClick={async () => {
        setCurrentFileSharePath(fsp);
        await handleFileBrowserNavigation({ fspName: fsp.name });
      }}
      className={`w-full x-short:py-0 flex gap-2 items-center justify-between rounded-none cursor-pointer text-foreground hover:!bg-primary-light/30 focus:!bg-primary-light/30 ${isCurrentPath ? '!bg-primary-light/30' : index % 2 !== 0 ? '!bg-background' : '!bg-surface/50'}`}
    >
      <Link
        to="/browse"
        className="max-w-[calc(100%-4rem)] grow flex flex-col gap-2 !text-foreground hover:!text-black focus:!text-black dark:hover:!text-white dark:focus:!text-white"
      >
        <div className="flex gap-1 items-center max-w-full">
          <RectangleStackIcon className="icon-small x-short:icon-xsmall" />
          <Typography className="truncate text-sm font-medium leading-4 x-short:text-xs">
            {fsp.storage}
          </Typography>
        </div>

        <Typography className="text-xs truncate max-w-full">
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
          variant="ghost"
          isCircular
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            handleFavoriteChange(fsp, 'fileSharePath');
          }}
        >
          {isFavoritePath ? (
            <StarFilled className="icon-small x-short:icon-xsmall mb-[2px]" />
          ) : (
            <StarOutline className="icon-small x-short:icon-xsmall mb-[2px]" />
          )}
        </IconButton>
      </div>
    </List.Item>
  );
}
