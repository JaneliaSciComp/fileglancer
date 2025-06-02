import React from 'react';

import {
  Zone,
  FileSharePath,
  ZonesAndFileSharePathsMap
} from '../shared.types';
import { sendFetchRequest, makeMapKey } from '../utils';
import { useCookiesContext } from '../contexts/CookiesContext';

type ZoneBrowserContextType = {
  isZonesMapReady: boolean;
  zonesAndFileSharePathsMap: ZonesAndFileSharePathsMap;
  currentNavigationZone: string | null;
  setCurrentNavigationZone: React.Dispatch<React.SetStateAction<string | null>>;
  currentFileSharePath: FileSharePath | null;
  setCurrentFileSharePath: React.Dispatch<
    React.SetStateAction<FileSharePath | null>
  >;
  updateZonesAndFileSharePathsMap: () => Promise<void>;
};

const ZoneBrowserContext = React.createContext<ZoneBrowserContextType | null>(
  null
);

export const useZoneBrowserContext = () => {
  const context = React.useContext(ZoneBrowserContext);
  if (!context) {
    throw new Error(
      'useZoneBrowserContext must be used within a ZoneBrowserProvider'
    );
  }
  return context;
};

export const ZoneBrowserContextProvider = ({
  children
}: {
  children: React.ReactNode;
}) => {
  const [isZonesMapReady, setIsZonesMapReady] = React.useState(false);
  const [zonesAndFileSharePathsMap, setZonesAndFileSharePathsMap] =
    React.useState<ZonesAndFileSharePathsMap>({});
  const [currentNavigationZone, setCurrentNavigationZone] = React.useState<
    string | null
  >(null);
  const [currentFileSharePath, setCurrentFileSharePath] =
    React.useState<FileSharePath | null>(null);

  const { cookies } = useCookiesContext();

  async function getZones(): Promise<{ paths: FileSharePath[] }> {
    const url = '/api/fileglancer/file-share-paths';
    let rawData: { paths: FileSharePath[] } = { paths: [] };
    try {
      const response = await sendFetchRequest(url, 'GET', cookies['_xsrf']);
      rawData = await response.json();
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error('An unknown error occurred');
      }
    }
    return rawData;
  }

  function createZonesAndFileSharePathsMap(rawData: {
    paths: FileSharePath[];
  }) {
    const newZonesAndFileSharePathsMap: ZonesAndFileSharePathsMap = {};
    rawData.paths.forEach(item => {
      // Zones first
      // If the zone doesn't exist in the map, create it
      const zoneKey = makeMapKey('zone', item.zone);
      if (!newZonesAndFileSharePathsMap[zoneKey]) {
        newZonesAndFileSharePathsMap[zoneKey] = {
          name: item.zone,
          fileSharePaths: []
        } as Zone;
      }
      // If/once zone exists, add file share paths to it
      const existingZone = newZonesAndFileSharePathsMap[zoneKey] as Zone;
      existingZone.fileSharePaths.push(item);

      // Then add file share paths to the map
      const fspKey = makeMapKey('fsp', item.name);
      if (!newZonesAndFileSharePathsMap[fspKey]) {
        newZonesAndFileSharePathsMap[fspKey] = item;
      }
    });
    return newZonesAndFileSharePathsMap;
  }

  function alphabetizeZonesAndFsps(map: ZonesAndFileSharePathsMap) {
    const sortedMap: ZonesAndFileSharePathsMap = {};

    const zoneKeys = Object.keys(map)
      .filter(key => key.startsWith('zone'))
      .sort((a, b) => map[a].name.localeCompare(map[b].name));

    // Add sorted zones to the new map
    zoneKeys.forEach(zoneKey => {
      const zone = map[zoneKey] as Zone;

      // Sort file share paths within the zone
      const sortedFileSharePaths = [...zone.fileSharePaths].sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      sortedMap[zoneKey] = {
        ...zone,
        fileSharePaths: sortedFileSharePaths
      };
    });

    // Add the remaining keys (e.g., FSPs) without sorting
    Object.keys(map)
      .filter(key => key.startsWith('fsp'))
      .forEach(fspKey => {
        sortedMap[fspKey] = map[fspKey];
      });

    return sortedMap;
  }

  async function updateZonesAndFileSharePathsMap() {
    let rawData: { paths: FileSharePath[] } = { paths: [] };
    try {
      rawData = await getZones();
      const newZonesAndFileSharePathsMap =
        createZonesAndFileSharePathsMap(rawData);
      const sortedMap = alphabetizeZonesAndFsps(newZonesAndFileSharePathsMap);
      setZonesAndFileSharePathsMap(sortedMap);
      setIsZonesMapReady(true);
      console.log('zones and fsp map in ZoneBrowserContext:', sortedMap);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error('An unknown error occurred when fetching zones');
      }
    }
  }

  // When app first loads, fetch file share paths
  // and create a map of zones and file share paths
  React.useEffect(() => {
    updateZonesAndFileSharePathsMap();
  }, []);

  return (
    <ZoneBrowserContext.Provider
      value={{
        isZonesMapReady,
        zonesAndFileSharePathsMap,
        currentNavigationZone,
        setCurrentNavigationZone,
        currentFileSharePath,
        setCurrentFileSharePath,
        updateZonesAndFileSharePathsMap
      }}
    >
      {children}
    </ZoneBrowserContext.Provider>
  );
};
