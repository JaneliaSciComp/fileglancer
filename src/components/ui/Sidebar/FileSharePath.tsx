import React from 'react';
import { Link } from 'react-router';
import { List, Typography, IconButton } from '@material-tailwind/react';
import { HiOutlineStar, HiStar } from 'react-icons/hi';
import { HiOutlineRectangleStack } from 'react-icons/hi2';

import type { FileSharePath } from '@/shared.types';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import {
  makeBrowseLink,
  makeMapKey,
  getPreferredPathForDisplay
} from '@/utils';

type FileSharePathComponentProps = {
  fsp: FileSharePath;
  isFavoritable?: boolean;
};

export default function FileSharePathComponent({
  fsp,
  isFavoritable = true
}: FileSharePathComponentProps) {
  const { pathPreference, fileSharePathPreferenceMap, handleFavoriteChange } =
    usePreferencesContext();

  const isFavoritePath = fileSharePathPreferenceMap[makeMapKey('fsp', fsp.name)]
    ? true
    : false;
  const fspPath = getPreferredPathForDisplay(pathPreference, fsp);
  const link = makeBrowseLink(fsp.name);

  return (
    <List.Item className="file-share-path pl-6 w-full flex items-center justify-between rounded-md cursor-pointer text-foreground hover:!bg-primary-light/30 focus:!bg-primary-light/30">
      <Link
        to={link}
        className="max-w-[calc(100%-1rem)] grow flex flex-col gap-1 !text-foreground hover:!text-black focus:!text-black dark:hover:!text-white dark:focus:!text-white"
      >
        <div className="flex gap-1 items-center max-w-full">
          <HiOutlineRectangleStack className="icon-small short:icon-xsmall stroke-2" />
          <Typography className="truncate text-sm leading-4 short:text-xs font-semibold">
            {fsp.storage}
          </Typography>
        </div>

        <Typography className="text-sm short:text-xs truncate max-w-full">
          {fspPath}
        </Typography>
      </Link>

      {isFavoritable && (
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
              await handleFavoriteChange(fsp, 'fileSharePath');
            }}
          >
            {isFavoritePath ? (
              <HiStar className="icon-small short:icon-xsmall mb-[2px]" />
            ) : (
              <HiOutlineStar className="icon-small short:icon-xsmall mb-[2px]" />
            )}
          </IconButton>
        </div>
      )}
    </List.Item>
  );
}
