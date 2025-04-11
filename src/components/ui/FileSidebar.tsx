import React from 'react';
import { Link } from 'react-router';
import {
  Card,
  Collapse,
  Typography,
  List,
  IconButton,
  Input
} from '@material-tailwind/react';
import {
  ChevronRightIcon,
  FolderIcon,
  FunnelIcon,
  Squares2X2Icon,
  StarIcon as StarOutline
} from '@heroicons/react/24/outline';
import { StarIcon as StarFilled } from '@heroicons/react/24/solid';

import { FileSharePaths } from '../../shared.types';

import { usePreferencesContext } from '../../contexts/PreferencesContext';
import { useZoneBrowserContext } from '../../contexts/ZoneBrowserContext';
import { useFileBrowserContext } from '../../contexts/FileBrowserContext';

import useZoneFilter from '../../hooks/useZoneFilter';
import useToggleOpenZones from '../../hooks/useToggleOpenZones';

export default function FileSidebar() {
  const {
    zoneFavorites,
    fileSharePathFavorites,
    pathPreference,
    handleFavoriteChange
  } = usePreferencesContext();

  const { fileSharePaths, setCurrentNavigationZone } = useZoneBrowserContext();
  const { fetchAndFormatFilesForDisplay } = useFileBrowserContext();

  const { searchQuery, filteredFileSharePaths, handleSearchChange } =
    useZoneFilter();
  const { openZones, toggleZone } = useToggleOpenZones();

  const displayPaths =
    Object.keys(filteredFileSharePaths).length > 0 || searchQuery.length > 0
      ? filteredFileSharePaths
      : fileSharePaths;

  const sortByFavorites = (displayPaths: FileSharePaths) => {
    // Sort the zones based on favorites
    const sortedPaths = Object.keys(displayPaths)
      .sort((a, b) => {
        const aIsFavorite = zoneFavorites.includes(a);
        const bIsFavorite = zoneFavorites.includes(b);
        if (aIsFavorite && !bIsFavorite) {
          return -1;
        }
        if (!aIsFavorite && bIsFavorite) {
          return 1;
        }
        return a.localeCompare(b);
      })
      .reduce((acc, key) => {
        // Sort the items within each zone
        acc[key] = [...displayPaths[key]].sort((a, b) => {
          // Check if linux_path of adjacent items are favorite paths
          const aIsFavorite = fileSharePathFavorites.includes(a.linux_path);
          const bIsFavorite = fileSharePathFavorites.includes(b.linux_path);

          if (aIsFavorite && !bIsFavorite) {
            return -1;
          }
          if (!aIsFavorite && bIsFavorite) {
            return 1;
          }
          return a.name.localeCompare(b.name);
        });
        return acc;
      }, {} as FileSharePaths);
    return sortedPaths;
  };

  // Sort displayPaths so zones that are favorites are at the top
  const sortedDisplayPaths: FileSharePaths = zoneFavorites
    ? sortByFavorites(displayPaths)
    : displayPaths;

  // Handler for when a path is clicked in the sidebar
  const handlePathClick = (path: string) => {
    setCurrentNavigationZone(path);
    fetchAndFormatFilesForDisplay(path);
  };

  return (
    <Card className="max-w-[280px] max-h-full overflow-hidden rounded-none bg-surface shadow-lg flex flex-col">
      <div className="w-[calc(100%-1.5rem)] mx-3 mt-3">
        <Input
          className="bg-background text-foreground"
          type="search"
          placeholder="Type to filter zones"
          value={searchQuery}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            handleSearchChange(e, fileSharePaths)
          }
        >
          <Input.Icon>
            <FunnelIcon className="h-full w-full" />
          </Input.Icon>
        </Input>
      </div>

      <div className="w-[calc(100%-1.5rem)] mt-3 mx-3 bg-background border border-surface shadow-sm flex flex-col flex-1 max-h-full">
        <List className="bg-surface-light border border-surface py-2">
          <List.Item className="pointer-events-none">
            <List.ItemStart>
              <Squares2X2Icon className="h-5 w-5 text-surface-foreground" />
            </List.ItemStart>
            <Typography className="font-semibold text-surface-foreground">
              Zones
            </Typography>
          </List.Item>
        </List>
        <List className="bg-background overflow-y-auto flex-grow">
          {Object.entries(sortedDisplayPaths).map(
            ([zone, pathItems], index) => {
              const isOpen = openZones[zone] || false;
              const isFavoriteZone = zoneFavorites.includes(zone)
                ? true
                : false;
              return (
                <React.Fragment key={zone}>
                  <List.Item
                    onClick={() => toggleZone(zone)}
                    className="cursor-pointer rounded-none py-3 flex-shrink-0 hover:bg-primary-light/30"
                  >
                    <List.ItemStart>
                      <Squares2X2Icon className="h-[18px] w-[18px]" />
                    </List.ItemStart>
                    <div className="flex-1 min-w-0 flex items-center gap-1">
                      <Typography>{zone}</Typography>
                      <div
                        className="flex items-center"
                        onClick={e => e.stopPropagation()}
                      >
                        <IconButton
                          variant="ghost"
                          isCircular
                          onClick={() => handleFavoriteChange(zone, 'zone')}
                        >
                          {isFavoriteZone ? (
                            <StarFilled className="h-[18px] w-[18px] mb-[2px]" />
                          ) : (
                            <StarOutline className="h-[18px] w-[18px] mb-[2px]" />
                          )}
                        </IconButton>
                      </div>
                    </div>
                    <List.ItemEnd>
                      <ChevronRightIcon
                        className={`h-4 w-4 ${isOpen ? 'rotate-90' : ''}`}
                      />
                    </List.ItemEnd>
                  </List.Item>
                  <Collapse open={isOpen}>
                    <List className="bg-background">
                      {pathItems.map((pathItem, pathIndex) => {
                        const isFavoritePath = fileSharePathFavorites.includes(
                          pathItem.linux_path
                        )
                          ? true
                          : false;
                        return (
                          <List.Item
                            key={`${zone}-${pathItem.name}`}
                            onClick={() => handlePathClick(pathItem.name)}
                            className={`flex gap-2 items-center justify-between pl-5 rounded-none cursor-pointer text-foreground hover:bg-primary-light/30 focus:bg-primary-light/30  ${pathIndex % 2 === 0 ? 'bg-surface/50' : 'bg-background'}`}
                          >
                            <Link
                              to="/files"
                              className="flex flex-col gap-2 !text-foreground hover:!text-black focus:!text-black"
                            >
                              <div className="flex gap-1 items-center">
                                <FolderIcon className="h-[18px] w-[18px]" />
                                <Typography className="text-sm font-medium leading-[18px]">
                                  {pathItem.storage}
                                </Typography>
                              </div>

                              <Typography className="text-xs">
                                {pathPreference[0] === 'linux_path'
                                  ? pathItem.linux_path
                                  : pathPreference[0] === 'windows_path'
                                    ? pathItem.windows_path
                                    : pathPreference[0] === 'mac_path'
                                      ? pathItem.mac_path
                                      : pathItem.linux_path}
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
                                onClick={(
                                  e: React.MouseEvent<HTMLButtonElement>
                                ) => {
                                  e.stopPropagation();
                                  handleFavoriteChange(
                                    pathItem.linux_path,
                                    'fileSharePath'
                                  );
                                }}
                              >
                                {isFavoritePath ? (
                                  <StarFilled className="h-[18px] w-[18px] mb-[2px]" />
                                ) : (
                                  <StarOutline className="h-[18px] w-[18px] mb-[2px]" />
                                )}
                              </IconButton>
                            </div>
                          </List.Item>
                        );
                      })}
                    </List>
                  </Collapse>
                </React.Fragment>
              );
            }
          )}
        </List>
      </div>
    </Card>
  );
}
