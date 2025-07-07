import React from 'react';
import { default as log } from '@/logger';
import { useErrorBoundary } from 'react-error-boundary';

import type { FileSharePath, Zone } from '@/shared.types';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { useZoneAndFspMapContext } from './ZonesAndFspMapContext';
import { useOpenFavoritesContext } from './OpenFavoritesContext';
import { sendFetchRequest, makeMapKey, HTTPError } from '@/utils';

export type FolderFavorite = {
  type: 'folder';
  folderPath: string;
  fsp: FileSharePath;
};

// Types for the zone, fsp, and folder information stored to the backend "preferences"
export type ZonePreference = { type: 'zone'; name: string };
export type FileSharePathPreference = { type: 'fsp'; name: string };
export type FolderPreference = {
  type: 'folder';
  folderPath: string;
  fspName: string;
};

type PreferencesContextType = {
  pathPreference: ['linux_path'] | ['windows_path'] | ['mac_path'];
  handlePathPreferenceSubmit: (
    event: React.FormEvent<HTMLFormElement>,
    localPathPreference: PreferencesContextType['pathPreference']
  ) => Promise<Response>;
  zonePreferenceMap: Record<string, ZonePreference>;
  zoneFavorites: Zone[];
  fileSharePathPreferenceMap: Record<string, FileSharePathPreference>;
  fileSharePathFavorites: FileSharePath[];
  folderPreferenceMap: Record<string, FolderPreference>;
  folderFavorites: FolderFavorite[];
  isFileSharePathFavoritesReady: boolean;
  handleFavoriteChange: (
    item: Zone | FileSharePath | FolderFavorite,
    type: 'zone' | 'fileSharePath' | 'folder'
  ) => Promise<Response>;
};

const PreferencesContext = React.createContext<PreferencesContextType | null>(
  null
);

export const usePreferencesContext = () => {
  const context = React.useContext(PreferencesContext);
  if (!context) {
    throw new Error(
      'usePreferencesContext must be used within a PreferencesProvider'
    );
  }
  return context;
};

export const PreferencesProvider = ({
  children
}: {
  children: React.ReactNode;
}) => {
  const [pathPreference, setPathPreference] = React.useState<
    ['linux_path'] | ['windows_path'] | ['mac_path']
  >(['linux_path']);

  const [zonePreferenceMap, setZonePreferenceMap] = React.useState<
    Record<string, ZonePreference>
  >({});
  const [zoneFavorites, setZoneFavorites] = React.useState<Zone[]>([]);
  const [fileSharePathPreferenceMap, setFileSharePathPreferenceMap] =
    React.useState<Record<string, FileSharePathPreference>>({});
  const [fileSharePathFavorites, setFileSharePathFavorites] = React.useState<
    FileSharePath[]
  >([]);
  const [folderPreferenceMap, setFolderPreferenceMap] = React.useState<
    Record<string, FolderPreference>
  >({});
  const [folderFavorites, setFolderFavorites] = React.useState<
    FolderFavorite[]
  >([]);
  const [isFileSharePathFavoritesReady, setIsFileSharePathFavoritesReady] =
    React.useState(false);

  const { cookies } = useCookiesContext();
  const { isZonesMapReady, zonesAndFileSharePathsMap } =
    useZoneAndFspMapContext();
  const { openFavoritesSection } = useOpenFavoritesContext();
  const { showBoundary } = useErrorBoundary();

  const fetchPreferences = React.useCallback(
    async (key: string) => {
      try {
        const data = await sendFetchRequest(
          `/api/fileglancer/preference?key=${key}`,
          'GET',
          cookies['_xsrf']
        ).then(response => response.json());
        return data?.value;
      } catch (error) {
        if (error instanceof HTTPError && error.responseCode === 404) {
          log.debug(`Preference '${key}' not found`);
        } else {
          log.error(`Error fetching preference '${key}':`, error);
        }
        return null;
      }
    },
    [cookies]
  );

  const accessMapItems = React.useCallback(
    (keys: string[]) => {
      const itemsArray = keys.map(key => {
        return zonesAndFileSharePathsMap[key];
      });
      // To help with debugging edge cases
      log.debug(`length of preference keys list: ${keys.length}`);
      log.debug(`length of accessed items list: ${itemsArray.length}`);
      return itemsArray;
    },
    [zonesAndFileSharePathsMap]
  );

  const updateLocalZonePreferenceStates = React.useCallback(
    (updatedMap: Record<string, ZonePreference>) => {
      setZonePreferenceMap(updatedMap);
      const updatedZoneFavorites = accessMapItems(
        Object.keys(updatedMap)
      ) as Zone[];
      updatedZoneFavorites.sort((a, b) => a.name.localeCompare(b.name));
      setZoneFavorites(updatedZoneFavorites as Zone[]);
    },
    [accessMapItems]
  );

  const updateLocalFspPreferenceStates = React.useCallback(
    (updatedMap: Record<string, FileSharePathPreference>) => {
      setFileSharePathPreferenceMap(updatedMap);
      const updatedFspFavorites = accessMapItems(
        Object.keys(updatedMap)
      ) as FileSharePath[];
      // Sort based on the storage name, which is what is displayed in the UI
      updatedFspFavorites.sort((a, b) => a.storage.localeCompare(b.storage));
      setFileSharePathFavorites(updatedFspFavorites as FileSharePath[]);
      setIsFileSharePathFavoritesReady(true);
    },
    [accessMapItems]
  );

  const updateLocalFolderPreferenceStates = React.useCallback(
    (updatedMap: Record<string, FolderPreference>) => {
      setFolderPreferenceMap(updatedMap);
      const updatedFolderFavorites = Object.entries(updatedMap).map(
        ([_, value]) => {
          const fspKey = makeMapKey('fsp', value.fspName);
          const fsp = zonesAndFileSharePathsMap[fspKey];
          return { type: 'folder', folderPath: value.folderPath, fsp: fsp };
        }
      );
      // Sort by the last segment of folderPath, which is the folder name
      updatedFolderFavorites.sort((a, b) => {
        const aLastSegment = a.folderPath.split('/').pop() || '';
        const bLastSegment = b.folderPath.split('/').pop() || '';
        return aLastSegment.localeCompare(bLastSegment);
      });
      setFolderFavorites(updatedFolderFavorites as FolderFavorite[]);
    },
    [zonesAndFileSharePathsMap]
  );

  const savePreferencesToBackend = React.useCallback(
    async <T,>(key: string, value: T) => {
      return await sendFetchRequest(
        `/api/fileglancer/preference?key=${key}`,
        'PUT',
        cookies['_xsrf'],
        { value: value }
      );
    },
    [cookies]
  );

  const handlePathPreferenceSubmit = React.useCallback(
    async (
      event: React.FormEvent<HTMLFormElement>,
      localPathPreference: ['linux_path'] | ['windows_path'] | ['mac_path']
    ) => {
      event.preventDefault();
      const response = await savePreferencesToBackend(
        'path',
        localPathPreference
      );
      if (response.ok) {
        setPathPreference(localPathPreference);
      }
      return response;
    },
    [savePreferencesToBackend]
  );

  function updatePreferenceList<T>(
    key: string,
    itemToUpdate: T,
    favoritesList: Record<string, T>
  ): { updatedFavorites: Record<string, T>; favoriteAdded: boolean } {
    const updatedFavorites = { ...favoritesList };
    const match = updatedFavorites[key];
    let favoriteAdded = false;
    if (match) {
      delete updatedFavorites[key];
      favoriteAdded = false;
    } else if (!match) {
      updatedFavorites[key] = itemToUpdate;
      favoriteAdded = true;
    }
    return { updatedFavorites, favoriteAdded };
  }

  const handleZoneFavoriteChange = React.useCallback(
    async (item: Zone) => {
      const key = makeMapKey('zone', item.name);
      const { updatedFavorites, favoriteAdded } = updatePreferenceList(
        key,
        { type: 'zone', name: item.name },
        zonePreferenceMap
      ) as {
        updatedFavorites: Record<string, ZonePreference>;
        favoriteAdded: boolean;
      };
      const response = await savePreferencesToBackend(
        'zone',
        Object.values(updatedFavorites)
      );
      if (response.ok) {
        updateLocalZonePreferenceStates(updatedFavorites);
      }
      return { response, favoriteAdded };
    },
    [
      zonePreferenceMap,
      savePreferencesToBackend,
      updateLocalZonePreferenceStates
    ]
  );

  const handleFileSharePathFavoriteChange = React.useCallback(
    async (item: FileSharePath) => {
      const key = makeMapKey('fsp', item.name);
      const { updatedFavorites, favoriteAdded } = updatePreferenceList(
        key,
        { type: 'fsp', name: item.name },
        fileSharePathPreferenceMap
      ) as {
        updatedFavorites: Record<string, FileSharePathPreference>;
        favoriteAdded: boolean;
      };
      const response = await savePreferencesToBackend(
        'fileSharePath',
        Object.values(updatedFavorites)
      );
      if (response.ok) {
        updateLocalFspPreferenceStates(updatedFavorites);
      }
      return { response, favoriteAdded };
    },
    [
      fileSharePathPreferenceMap,
      savePreferencesToBackend,
      updateLocalFspPreferenceStates
    ]
  );

  const handleFolderFavoriteChange = React.useCallback(
    async (item: FolderFavorite) => {
      const folderPrefKey = makeMapKey(
        'folder',
        `${item.fsp.name}_${item.folderPath}`
      );
      const { updatedFavorites, favoriteAdded } = updatePreferenceList(
        folderPrefKey,
        {
          type: 'folder',
          folderPath: item.folderPath,
          fspName: item.fsp.name
        },
        folderPreferenceMap
      ) as {
        updatedFavorites: Record<string, FolderPreference>;
        favoriteAdded: boolean;
      };
      const response = await savePreferencesToBackend(
        'folder',
        Object.values(updatedFavorites)
      );
      if (response.ok) {
        updateLocalFolderPreferenceStates(updatedFavorites);
      }
      return { response, favoriteAdded };
    },
    [
      folderPreferenceMap,
      savePreferencesToBackend,
      updateLocalFolderPreferenceStates
    ]
  );

  const handleFavoriteChange = React.useCallback(
    async (
      item: Zone | FileSharePath | FolderFavorite,
      type: 'zone' | 'fileSharePath' | 'folder'
    ) => {
      let result: { response: Response; favoriteAdded: boolean };

      if (type === 'zone') {
        result = await handleZoneFavoriteChange(item as Zone);
      } else if (type === 'fileSharePath') {
        result = await handleFileSharePathFavoriteChange(item as FileSharePath);
      } else if (type === 'folder') {
        result = await handleFolderFavoriteChange(item as FolderFavorite);
      } else {
        throw new Error(`Invalid type: ${type}`);
      }

      if (result.favoriteAdded) {
        openFavoritesSection();
      }

      return result.response;
    },
    [
      handleZoneFavoriteChange,
      handleFileSharePathFavoriteChange,
      handleFolderFavoriteChange,
      openFavoritesSection
    ]
  );

  React.useEffect(() => {
    (async function () {
      try {
        const rawPathPreference = await fetchPreferences('path');
        if (rawPathPreference) {
          log.debug('setting initial path preference:', rawPathPreference);
          setPathPreference(rawPathPreference);
        }
      } catch (error) {
        showBoundary(error);
      }
    })();
  }, [fetchPreferences, showBoundary]);

  React.useEffect(() => {
    if (!isZonesMapReady) {
      return;
    }

    (async function () {
      try {
        const backendPrefs = await fetchPreferences('zone');
        const zoneArray =
          backendPrefs?.map((pref: ZonePreference) => {
            const key = makeMapKey(pref.type, pref.name);
            return { [key]: pref };
          }) || [];
        const zoneMap = Object.assign({}, ...zoneArray);
        if (zoneMap) {
          updateLocalZonePreferenceStates(zoneMap);
        }
      } catch (error) {
        showBoundary(error);
      }
    })();
  }, [
    isZonesMapReady,
    fetchPreferences,
    updateLocalZonePreferenceStates,
    showBoundary
  ]);

  React.useEffect(() => {
    if (!isZonesMapReady) {
      return;
    }

    (async function () {
      try {
        const backendPrefs = await fetchPreferences('fileSharePath');
        const fspArray =
          backendPrefs?.map((pref: FileSharePathPreference) => {
            const key = makeMapKey(pref.type, pref.name);
            return { [key]: pref };
          }) || [];
        const fspMap = Object.assign({}, ...fspArray);
        if (fspMap) {
          updateLocalFspPreferenceStates(fspMap);
        }
      } catch (error) {
        showBoundary(error);
      }
    })();
  }, [
    isZonesMapReady,
    fetchPreferences,
    updateLocalFspPreferenceStates,
    showBoundary
  ]);

  React.useEffect(() => {
    if (!isZonesMapReady) {
      return;
    }

    (async function () {
      try {
        const backendPrefs = await fetchPreferences('folder');
        const folderArray =
          backendPrefs?.map((pref: FolderPreference) => {
            const key = makeMapKey(
              pref.type,
              `${pref.fspName}_${pref.folderPath}`
            );
            return { [key]: pref };
          }) || [];
        const folderMap = Object.assign({}, ...folderArray);
        if (folderMap) {
          updateLocalFolderPreferenceStates(folderMap);
        }
      } catch (error) {
        showBoundary(error);
      }
    })();
  }, [
    isZonesMapReady,
    fetchPreferences,
    updateLocalFolderPreferenceStates,
    showBoundary
  ]);

  return (
    <PreferencesContext.Provider
      value={{
        pathPreference,
        handlePathPreferenceSubmit,
        zonePreferenceMap,
        zoneFavorites,
        fileSharePathPreferenceMap,
        fileSharePathFavorites,
        folderPreferenceMap,
        folderFavorites,
        isFileSharePathFavoritesReady,
        handleFavoriteChange
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};
