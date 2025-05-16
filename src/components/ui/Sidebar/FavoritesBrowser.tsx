import React from 'react';
// import { Link } from 'react-router-dom';
import {
  Collapse,
  //   IconButton,
  Typography,
  List
} from '@material-tailwind/react';
import {
  ChevronRightIcon
  //   FolderIcon,
  //   StarIcon as StarOutline
} from '@heroicons/react/24/outline';
import { StarIcon as StarFilled } from '@heroicons/react/24/solid';

import Zone from './Zone';
// import FileSharePathComponent from './FileSharePath';
import {
  //   DirectoryFavorite,
  usePreferencesContext
} from '../../../contexts/PreferencesContext';
// import { useZoneBrowserContext } from '../../../contexts/ZoneBrowserContext';
// import { useFileBrowserContext } from '../../../contexts/FileBrowserContext';
import useToggleOpenFavorites from '../../../hooks/useToggleOpenFavorites';
// import {
//   FileSharePath
//   //   ZonesAndFileSharePathsMap
// } from '../../../shared.types';

export default function FavoritesBrowser() {
  //   {
  //     //   searchQuery,
  //     //   setOpenZones
  //     //   filteredZoneFavorites,
  //     //   filteredFileSharePathFavorites,
  //     //   filteredDirectoryFavorites
  //   }: {
  //     //   searchQuery: string;
  //     //   setOpenZones: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  //     //   filteredZoneFavorites: ZonesAndFileSharePaths[];
  //     //   filteredFileSharePathFavorites: FileSharePath[];
  //     //   filteredDirectoryFavorites: DirectoryFavorite[];
  //   }
  const { openFavorites, toggleOpenFavorites } = useToggleOpenFavorites();
  const {
    zoneFavorites
    // fileSharePathFavorites,
    // directoryFavorites,
    // pathPreference,
    // handleFavoriteChange
  } = usePreferencesContext();
  //   const { currentDir, fetchAndFormatFilesForDisplay } = useFileBrowserContext();
  //   const {
  //     setCurrentNavigationZone,
  //     currentFileSharePath,
  //     setCurrentFileSharePath
  //   } = useZoneBrowserContext();

  const displayZones = zoneFavorites;
  // filteredZoneFavorites.length > 0 || searchQuery.length > 0
  //   ? filteredZoneFavorites
  //   : zoneFavorites;

  //   const displayFileSharePaths =
  //     filteredFileSharePathFavorites.length > 0 || searchQuery.length > 0
  //       ? filteredFileSharePathFavorites
  //       : fileSharePathFavorites;

  //   const displayDirectories =
  //     filteredDirectoryFavorites.length > 0 || searchQuery.length > 0
  //       ? filteredDirectoryFavorites
  //       : directoryFavorites;

  return (
    <div className="w-[calc(100%-1.5rem)] min-h-fit flex flex-col overflow-hidden h-full mt-3 mx-3 pb-1">
      <List className="bg-background">
        <List.Item
          onClick={() => toggleOpenFavorites('all')}
          className="cursor-pointer rounded-none py-3 bg-surface/50 hover:!bg-surface-light focus:!bg-surface-light"
        >
          <List.ItemStart>
            <StarFilled className="h-5 w-5 text-surface-foreground" />
          </List.ItemStart>
          <Typography className="font-semibold text-surface-foreground">
            Favorites
          </Typography>
          <List.ItemEnd className="pr-2">
            <ChevronRightIcon
              className={`h-4 w-4 ${openFavorites['all'] ? 'rotate-90' : ''}`}
            />
          </List.ItemEnd>
        </List.Item>
      </List>
      <div className="overflow-y-auto">
        <Collapse open={openFavorites['all'] ? true : false}>
          <List className="bg-surface-light !py-0 !gap-0">
            {/* Zone favorites */}
            {displayZones.map(zone => {
              return (
                <Zone
                  zone={zone}
                  openZones={openFavorites}
                  toggleOpenZones={toggleOpenFavorites}
                />
              );
            })}

            {/* File share path favorites */}
            {/* {displayFileSharePaths.map((path, index) => {
              return (
                <FileSharePathComponent pathItem={path} pathIndex={index} />
              );
            })} */}

            {/* Directory favorites */}
            {/* {displayDirectories.map(directoryItem => {
              const fileSharePath =
                pathPreference[0] === 'linux_path'
                  ? directoryItem.fileSharePath.linux_path
                  : pathPreference[0] === 'windows_path'
                    ? directoryItem.fileSharePath.windows_path
                    : pathPreference[0] === 'mac_path'
                      ? directoryItem.fileSharePath.mac_path
                      : directoryItem.fileSharePath.linux_path;

              const isFavoriteDir = directoryFavorites.some(
                fav =>
                  fav.name === directoryItem.name &&
                  fav.fileSharePath.name === directoryItem.fileSharePath.name
              )
                ? true
                : false;

              return (
                <List.Item
                  key={`favorite-directory-${directoryItem.name}`}
                  onClick={() => {
                    setOpenZones({
                      all: true,
                      [directoryItem.fileSharePath.zone]: true
                    });
                    setCurrentNavigationZone(directoryItem.fileSharePath.zone);
                    setCurrentFileSharePath(directoryItem.fileSharePath);
                    fetchAndFormatFilesForDisplay(
                      `${directoryItem.fileSharePath.name}?subpath=${directoryItem.path}`
                    );
                  }}
                  className={`flex gap-2 items-center justify-between rounded-none cursor-pointer text-foreground hover:bg-primary-light/30 focus:bg-primary-light/30 ${directoryItem.fileSharePath === currentFileSharePath && directoryItem.name === currentDir ? '!bg-primary-light/30' : '!bg-background'}`}
                >
                  <Link
                    to="/files"
                    className="flex flex-col gap-2 !text-foreground hover:!text-black focus:!text-black hover:dark:!text-white focus:dark:!text-white"
                  >
                    <div className="flex gap-1 items-center">
                      <FolderIcon className="h-4 w-4" />
                      <Typography className="text-sm font-medium leading-4">
                        {directoryItem.name}
                      </Typography>
                    </div>
                    <Typography className="text-xs">
                      {`${fileSharePath}/${directoryItem.path}`}
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
                        handleFavoriteChange(directoryItem, 'directory');
                      }}
                    >
                      {isFavoriteDir ? (
                        <StarFilled className="h-4 w-4 mb-[2px]" />
                      ) : (
                        <StarOutline className="h-4 w-4 mb-[2px]" />
                      )}
                    </IconButton>
                  </div>
                </List.Item>
              );
            })} */}
          </List>
        </Collapse>
      </div>
    </div>
  );
}
