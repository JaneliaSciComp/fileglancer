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
  readonly searchQuery: string;
  readonly filteredZoneFavorites: Zone[];
  readonly filteredFileSharePathFavorites: FileSharePath[];
  readonly filteredFolderFavorites: FolderFavorite[];
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
      <List className="!min-w-20">
        <List.Item
          className="cursor-pointer rounded-md py-2 short:py-1 hover:!bg-surface-light focus:!bg-surface-light"
          onClick={() => toggleOpenFavorites('all')}
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
        className="overflow-x-hidden flex-grow w-full"
        open={openFavorites['all'] ? true : false}
      >
        <List className="h-full py-0 gap-0 bg-background">
          {/* Zone favorites */}
          {displayZones.map(zone => {
            return (
              <ZoneComponent
                key={zone.name}
                openZones={openFavorites}
                toggleOpenZones={toggleOpenFavorites}
                zone={zone}
              />
            );
          })}

          {/* File share path favorites */}
          {displayFileSharePaths.map((fsp, index) => {
            return <FileSharePathComponent fsp={fsp} key={fsp.name} />;
          })}

          {/* Directory favorites */}
          {displayFolders.map(folderFavorite => {
            return (
              <Folder
                folderPath={folderFavorite.folderPath}
                fsp={folderFavorite.fsp}
                key={folderFavorite.fsp.name + '-' + folderFavorite.folderPath}
              />
            );
          })}
        </List>
      </Collapse>
    </div>
  );
}
