import React from 'react';
import { Collapse, Typography, List } from '@material-tailwind/react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarFilled } from '@heroicons/react/24/solid';

import ZoneComponent from './Zone';
import FileSharePathComponent from './FileSharePath';
import Folder from './Folder';
import {
  FolderFavorite,
  usePreferencesContext
} from '@/contexts/PreferencesContext';
import useToggleOpenFavorites from '@/hooks/useToggleOpenFavorites';
import { FileSharePath, Zone } from '@/shared.types';

type FavoritesBrowserProps = {
  searchQuery: string;
  setOpenZones: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  filteredZoneFavorites: Zone[];
  filteredFileSharePathFavorites: FileSharePath[];
  filteredFolderFavorites: FolderFavorite[];
};

export default function FavoritesBrowser({
  searchQuery,
  setOpenZones,
  filteredZoneFavorites,
  filteredFileSharePathFavorites,
  filteredFolderFavorites
}: FavoritesBrowserProps) {
  const { openFavorites, toggleOpenFavorites } = useToggleOpenFavorites();
  const { zoneFavorites, fileSharePathFavorites, folderFavorites } =
    usePreferencesContext();

  const displayZones =
    filteredZoneFavorites.length > 0 || searchQuery.length > 0
      ? filteredZoneFavorites
      : zoneFavorites;

  const displayFileSharePaths =
    filteredFileSharePathFavorites.length > 0 || searchQuery.length > 0
      ? filteredFileSharePathFavorites
      : fileSharePathFavorites;

  const displayFolders =
    filteredFolderFavorites.length > 0 || searchQuery.length > 0
      ? filteredFolderFavorites
      : folderFavorites;

  return (
    <div className="w-[calc(100%-1.5rem)] min-h-fit flex flex-col h-full x-short:mt-1 mt-3 mx-3 pb-1">
      <List className="bg-background !min-w-40">
        <List.Item
          onClick={() => toggleOpenFavorites('all')}
          className="cursor-pointer rounded-none py-3 x-short:py-1 bg-surface/50 hover:!bg-surface-light focus:!bg-surface-light"
        >
          <List.ItemStart>
            <StarFilled className="icon-default x-short:icon-xsmall text-surface-foreground" />
          </List.ItemStart>
          <Typography className="font-semibold text-surface-foreground x-short:text-xs short:text-xs">
            Favorites
          </Typography>
          <List.ItemEnd className="pr-2">
            <ChevronRightIcon
              className={`icon-small x-short:icon-xsmall ${openFavorites['all'] ? 'rotate-90' : ''}`}
            />
          </List.ItemEnd>
        </List.Item>
      </List>
      <div className="overflow-y-auto max-h-[calc(100%-3.5rem)]">
        <Collapse open={openFavorites['all'] ? true : false}>
          <List className="bg-surface-light !py-0 !gap-0 !min-w-20 overflow-hidden">
            {/* Zone favorites */}
            {displayZones.map(zone => {
              return (
                <ZoneComponent
                  key={zone.name}
                  zone={zone}
                  openZones={openFavorites}
                  toggleOpenZones={toggleOpenFavorites}
                />
              );
            })}

            {/* File share path favorites */}
            {displayFileSharePaths.map((fsp, index) => {
              return (
                <FileSharePathComponent
                  key={fsp.name}
                  fsp={fsp}
                  index={index}
                />
              );
            })}

            {/* Directory favorites */}
            {displayFolders.map(folderFavorite => {
              return (
                <Folder
                  key={
                    folderFavorite.fsp.name + '-' + folderFavorite.folderPath
                  }
                  folderFavorite={folderFavorite}
                  setOpenZones={setOpenZones}
                />
              );
            })}
          </List>
        </Collapse>
      </div>
    </div>
  );
}
