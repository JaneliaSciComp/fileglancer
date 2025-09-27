import { Collapse, Typography, List } from '@material-tailwind/react';
import { HiChevronRight } from 'react-icons/hi';
import { HiStar } from 'react-icons/hi';

import ZoneComponent from './Zone';
import FileSharePathComponent from './FileSharePath';
import Folder from './Folder';
import {
  FolderFavorite,
  usePreferencesContext
} from '@/contexts/PreferencesContext';
import { useOpenFavoritesContext } from '@/contexts/OpenFavoritesContext';
import { FileSharePath, Zone } from '@/shared.types';

type FavoritesBrowserProps = {
  searchQuery: string;
  filteredZoneFavorites: Zone[];
  filteredFileSharePathFavorites: FileSharePath[];
  filteredFolderFavorites: FolderFavorite[];
};

export default function FavoritesBrowser({
  searchQuery,
  filteredZoneFavorites,
  filteredFileSharePathFavorites,
  filteredFolderFavorites
}: FavoritesBrowserProps) {
  const { zoneFavorites, fileSharePathFavorites, folderFavorites } =
    usePreferencesContext();
  const { openFavorites, toggleOpenFavorites } = useOpenFavoritesContext();

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
    <div className="flex flex-col my-1 mx-1">
      <List aria-label="favorites-list-title" className="!min-w-20">
        <List.Item
          onClick={() => toggleOpenFavorites('all')}
          className="cursor-pointer rounded-md py-2 short:py-1 hover:!bg-surface-light focus:!bg-surface-light"
        >
          <List.ItemStart>
            <HiStar className="icon-default short:icon-small text-surface-foreground" />
          </List.ItemStart>
          <Typography className="font-bold text-surface-foreground short:text-sm text-base">
            Favorites
          </Typography>
          <List.ItemEnd>
            <HiChevronRight
              className={`icon-default short:icon-small ${openFavorites['all'] ? 'rotate-90' : ''}`}
            />
          </List.ItemEnd>
        </List.Item>
      </List>
      <Collapse
        open={openFavorites['all'] ? true : false}
        className="overflow-x-hidden flex-grow w-full"
      >
        <List
          aria-label="favorites-list"
          className="h-full py-0 gap-0 bg-background"
        >
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
            return <FileSharePathComponent key={fsp.name} fsp={fsp} />;
          })}

          {/* Directory favorites */}
          {displayFolders.map(folderFavorite => {
            return (
              <Folder
                key={folderFavorite.fsp.name + '-' + folderFavorite.folderPath}
                fsp={folderFavorite.fsp}
                folderPath={folderFavorite.folderPath}
              />
            );
          })}
        </List>
      </Collapse>
    </div>
  );
}
