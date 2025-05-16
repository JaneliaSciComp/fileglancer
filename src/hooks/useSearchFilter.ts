import React from 'react';
import type {
  Zone,
  ZonesAndFileSharePathsMap,
  FileSharePath
} from '../shared.types';
// import type { DirectoryFavorite } from '../contexts/PreferencesContext';
import { useZoneBrowserContext } from '../contexts/ZoneBrowserContext';
import { usePreferencesContext } from '../contexts/PreferencesContext';

export default function useSearchFilter() {
  const { zonesAndFileSharePathsMap } = useZoneBrowserContext();
  const { zoneFavorites } = usePreferencesContext();

  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [filteredZonesAndFileSharePaths, setFilteredZonesAndFileSharePaths] =
    React.useState<ZonesAndFileSharePathsMap>({});
  //   const [filteredZoneFavorites, setFilteredZoneFavorites] = React.useState<
  //     Record<string, Zone>
  //   >({});
  //   const [filteredFileSharePathFavorites, setFilteredFileSharePathFavorites] =
  //     React.useState<FileSharePath[]>([]);
  //   const [filteredDirectoryFavorites, setFilteredDirectoryFavorites] =
  //     React.useState<DirectoryFavorite[]>([]);

  function filterObjectByQuery(
    obj: Record<string, Zone | FileSharePath>,
    query: string
  ) {
    return Object.fromEntries(
      Object.entries(obj).filter(
        ([key, value]) => value.name.toLowerCase() === query
      )
    );
  }

  const filterZonesAndFileSharePaths = (query: string) => {
    const matches = filterObjectByQuery(zonesAndFileSharePathsMap, query);
    if (matches) {
      setFilteredZonesAndFileSharePaths(matches);
    }
  };

  //   const filterAllFavorites = (query: string) => {
  //     const filteredZoneFavorites = zoneFavorites.filter(zone =>
  //       Object.keys(zone)[0].toLowerCase().includes(query)
  //     );

  //     const filteredFileSharePathFavorites = fileSharePathFavorites.filter(
  //       fileSharePath =>
  //         fileSharePath.zone.toLowerCase().includes(query) ||
  //         fileSharePath.name.toLowerCase().includes(query) ||
  //         fileSharePath.group.toLowerCase().includes(query) ||
  //         fileSharePath.storage.toLowerCase().includes(query) ||
  //         fileSharePath.mount_path.toLowerCase().includes(query) ||
  //         fileSharePath.linux_path.toLowerCase().includes(query) ||
  //         fileSharePath.mac_path?.toLowerCase().includes(query) ||
  //         fileSharePath.windows_path?.toLowerCase().includes(query)
  //     );

  //     const filteredDirectoryFavorites = directoryFavorites.filter(
  //       directory =>
  //         directory.fileSharePath.zone.toLowerCase().includes(query) ||
  //         directory.fileSharePath.name.toLowerCase().includes(query) ||
  //         directory.name.toLowerCase().includes(query) ||
  //         directory.path.toLowerCase().includes(query)
  //     );

  //     setFilteredZoneFavorites(filteredZoneFavorites);
  //     setFilteredFileSharePathFavorites(filteredFileSharePathFavorites);
  //     setFilteredDirectoryFavorites(filteredDirectoryFavorites);
  //   };

  const handleSearchChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const searchQuery = event.target.value;
    setSearchQuery(searchQuery.trim().toLowerCase());
  };

  React.useEffect(() => {
    if (searchQuery !== '') {
      filterZonesAndFileSharePaths(searchQuery);
      //   filterAllFavorites(searchQuery);
    } else if (searchQuery === '') {
      // When search query is empty, use all the original paths
      setFilteredZonesAndFileSharePaths({});
      //   setFilteredZoneFavorites([]);
      //   setFilteredFileSharePathFavorites([]);
      //   setFilteredDirectoryFavorites([]);
    }
  }, [
    searchQuery,
    // zonesAndFileSharePaths,
    zoneFavorites
    // fileSharePathFavorites,
    // directoryFavorites
  ]);

  return {
    searchQuery,
    filteredZonesAndFileSharePaths,
    // filteredZoneFavorites,
    // filteredFileSharePathFavorites,
    // filteredDirectoryFavorites,
    handleSearchChange
  };
}
