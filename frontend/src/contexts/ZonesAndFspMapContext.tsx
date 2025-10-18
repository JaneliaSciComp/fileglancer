import React from 'react';
import { default as log } from '@/logger';
import { Zone, FileSharePath, ZonesAndFileSharePathsMap } from '@/shared.types';
import { sendFetchRequest, makeMapKey } from '@/utils';
import { removeTrailingSlashes } from '@/utils/pathHandling';
import { useCookiesContext } from './CookiesContext';

type ZonesAndFspMapContextType = {
  isZonesMapReady: boolean;
  areZoneDataLoading: boolean;
  zonesAndFileSharePathsMap: ZonesAndFileSharePathsMap;
};

const ZonesAndFspMapContext =
  React.createContext<ZonesAndFspMapContextType | null>(null);

export const useZoneAndFspMapContext = () => {
  const context = React.useContext(ZonesAndFspMapContext);
  if (!context) {
    throw new Error(
      'useZoneAndFspMapContext must be used within a ZoneAndFspMapContextProvider'
    );
  }
  return context;
};

export const ZonesAndFspMapContextProvider = ({
  children
}: {
  readonly children: React.ReactNode;
}) => {
  const [isZonesMapReady, setIsZonesMapReady] = React.useState(false);
  const [areZoneDataLoading, setAreZoneDataLoading] = React.useState(false);
  const [zonesAndFileSharePathsMap, setZonesAndFileSharePathsMap] =
    React.useState<ZonesAndFileSharePathsMap>({});

  const { cookies } = useCookiesContext();

  const getZones = React.useCallback(async (): Promise<{
    paths: FileSharePath[];
  }> => {
    let rawData: { paths: FileSharePath[] } = { paths: [] };
    try {
      const response = await sendFetchRequest(
        '/api/file-share-paths',
        'GET',
        cookies['_xsrf']
      );
      rawData = await response.json();
    } catch (error: unknown) {
      if (error instanceof Error) {
        log.error(error.message);
      } else {
        log.error('An unknown error occurred');
      }
    }
    return rawData;
  }, [cookies]);

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
      // Normalize mount_path to ensure no trailing slashes snuck into wiki db
      const fspKey = makeMapKey('fsp', item.name);
      if (!newZonesAndFileSharePathsMap[fspKey]) {
        const fspWithNormalizedMountPaths = {
          ...item,
          linux_path: removeTrailingSlashes(item.linux_path),
          mac_path: removeTrailingSlashes(item.mac_path),
          mount_path: removeTrailingSlashes(item.mount_path),
          windows_path: removeTrailingSlashes(item.windows_path)
        };
        newZonesAndFileSharePathsMap[fspKey] = fspWithNormalizedMountPaths;
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

  const updateZonesAndFileSharePathsMap =
    React.useCallback(async (): Promise<void> => {
      setAreZoneDataLoading(true);
      let rawData: { paths: FileSharePath[] } = { paths: [] };
      try {
        rawData = await getZones();
        const newZonesAndFileSharePathsMap =
          createZonesAndFileSharePathsMap(rawData);
        const sortedMap = alphabetizeZonesAndFsps(newZonesAndFileSharePathsMap);
        setZonesAndFileSharePathsMap(sortedMap);
        setIsZonesMapReady(true);
        log.debug('zones and fsp map in ZoneBrowserContext:', sortedMap);
      } catch (error: unknown) {
        if (error instanceof Error) {
          log.error(error.message);
        } else {
          log.error('An unknown error occurred when fetching zones');
        }
      } finally {
        setAreZoneDataLoading(false);
      }
    }, [getZones]);

  // When app first loads, fetch file share paths
  // and create a map of zones and file share paths
  React.useEffect(() => {
    const fetchAndSetInitialFspsAndZones = async () => {
      await updateZonesAndFileSharePathsMap();
    };
    if (!isZonesMapReady) {
      // Only fetch if the map is not already ready
      // to avoid unnecessary re-fetching
      fetchAndSetInitialFspsAndZones();
    }
  }, [updateZonesAndFileSharePathsMap, isZonesMapReady]);

  return (
    <ZonesAndFspMapContext.Provider
      value={{
        isZonesMapReady,
        areZoneDataLoading,
        zonesAndFileSharePathsMap
      }}
    >
      {children}
    </ZonesAndFspMapContext.Provider>
  );
};
