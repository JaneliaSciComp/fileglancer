import { useQuery, UseQueryResult } from '@tanstack/react-query';

import { sendFetchRequest, makeMapKey } from '@/utils';
import { removeTrailingSlashes } from '@/utils/pathHandling';
import { Zone, FileSharePath, ZonesAndFileSharePathsMap } from '@/shared.types';

export default function useZoneAndFileSharePathMapQuery(): UseQueryResult<
  ZonesAndFileSharePathsMap,
  Error
> {
  const getZones = async (): Promise<{ paths: FileSharePath[] }> => {
    const response = await sendFetchRequest('/api/file-share-paths', 'GET');
    return await response.json();
  };

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

  const makeSortedZonesAndFspsMap = (data: { paths: FileSharePath[] }) => {
    const zonesAndFileSharePathsMap = createZonesAndFileSharePathsMap(data);
    console.log('Zones and File Share Paths Map:', zonesAndFileSharePathsMap);
    return alphabetizeZonesAndFsps(zonesAndFileSharePathsMap);
  };

  return useQuery<{ paths: FileSharePath[] }, Error, ZonesAndFileSharePathsMap>(
    {
      queryKey: ['fileSharePaths'],
      queryFn: getZones,
      select: (data: { paths: FileSharePath[] }) =>
        makeSortedZonesAndFspsMap(data)
    }
  );
}
