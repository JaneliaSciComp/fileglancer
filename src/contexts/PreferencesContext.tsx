import React from 'react';
import { default as log } from '@/logger';

import type { FileSharePath, Zone } from '@/shared.types';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { useZoneAndFspMapContext } from './ZonesAndFspMapContext';
import { sendFetchRequest, makeMapKey, tryCatchWrapper } from '@/utils';

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
  showPathPrefAlert: boolean;
  setShowPathPrefAlert: React.Dispatch<React.SetStateAction<boolean>>;
  handlePathPreferenceSubmit: (
    event: React.FormEvent<HTMLFormElement>,
    localPathPreference: PreferencesContextType['pathPreference']
  ) => Promise<{ success: boolean; data?: void | undefined; error?: string }>;
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
  ) => Promise<{ success: boolean; data?: void | undefined; error?: string }>;
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
  const [showPathPrefAlert, setShowPathPrefAlert] = React.useState(false);

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

  const fetchPreferences = React.useCallback(
    async (key: string) => {
      return tryCatchWrapper(`Fetch ${key} preference`, async () => {
        const data = await sendFetchRequest(
          `/api/fileglancer/preference?key=${key}`,
          'GET',
          cookies['_xsrf']
        ).then(response => response.json());
        return data?.value;
      });
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
      return tryCatchWrapper('Save preference to backend', async () => {
        await sendFetchRequest(
          `/api/fileglancer/preference?key=${key}`,
          'PUT',
          cookies['_xsrf'],
          { value: value }
        );
      });
    },
    [cookies]
  );

  const handlePathPreferenceSubmit = React.useCallback(
    (
      event: React.FormEvent<HTMLFormElement>,
      localPathPreference: ['linux_path'] | ['windows_path'] | ['mac_path']
    ) => {
      event.preventDefault();
      return tryCatchWrapper('Handle path preference submit', async () => {
        savePreferencesToBackend('path', localPathPreference);
        setPathPreference(localPathPreference);
        setShowPathPrefAlert(true);
      });
    },
    [savePreferencesToBackend]
  );

  const updatePreferenceList = React.useCallback<
    <T>(
      key: string,
      itemToUpdate: T,
      favoritesList: Record<string, T>
    ) => Record<string, T>
  >((key, itemToUpdate, favoritesList) => {
    const updatedFavorites = { ...favoritesList };
    const match = updatedFavorites[key];
    if (match) {
      delete updatedFavorites[key];
    } else if (!match) {
      updatedFavorites[key] = itemToUpdate;
    }
    return updatedFavorites;
  }, []);

  const handleZoneFavoriteChange = React.useCallback(
    async (item: Zone) => {
      return tryCatchWrapper('Handle zone favorite change', async () => {
        const key = makeMapKey('zone', item.name);
        const updatedZonePreferenceMap = updatePreferenceList(
          key,
          { type: 'zone', name: item.name },
          zonePreferenceMap
        ) as Record<string, ZonePreference>;
        await savePreferencesToBackend(
          'zone',
          Object.values(updatedZonePreferenceMap)
        );
        updateLocalZonePreferenceStates(updatedZonePreferenceMap);
      });
    },
    [
      updatePreferenceList,
      zonePreferenceMap,
      savePreferencesToBackend,
      updateLocalZonePreferenceStates
    ]
  );

  const handleFileSharePathFavoriteChange = React.useCallback(
    async (item: FileSharePath) => {
      return tryCatchWrapper(
        'Handle file share path favorite change',
        async () => {
          const key = makeMapKey('fsp', item.name);
          const updatedFileSharePathMap = updatePreferenceList(
            key,
            { type: 'fsp', name: item.name },
            fileSharePathPreferenceMap
          ) as Record<string, FileSharePathPreference>;
          await savePreferencesToBackend(
            'fileSharePath',
            Object.values(updatedFileSharePathMap)
          );
          updateLocalFspPreferenceStates(updatedFileSharePathMap);
        }
      );
    },
    [
      updatePreferenceList,
      fileSharePathPreferenceMap,
      savePreferencesToBackend,
      updateLocalFspPreferenceStates
    ]
  );

  const handleFolderFavoriteChange = React.useCallback(
    async (item: FolderFavorite) => {
      return tryCatchWrapper('Handle folder favorite change', async () => {
        const folderPrefKey = makeMapKey(
          'folder',
          `${item.fsp.name}_${item.folderPath}`
        );
        const updatedFolderMap = updatePreferenceList(
          folderPrefKey,
          {
            type: 'folder',
            folderPath: item.folderPath,
            fspName: item.fsp.name
          },
          folderPreferenceMap
        ) as Record<string, FolderPreference>;
        await savePreferencesToBackend(
          'folder',
          Object.values(updatedFolderMap)
        );
        updateLocalFolderPreferenceStates(updatedFolderMap);
      });
    },
    [
      updatePreferenceList,
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
      return tryCatchWrapper('Favorite change handler', async () => {
        switch (type) {
          case 'zone':
            await handleZoneFavoriteChange(item as Zone);
            break;
          case 'fileSharePath':
            await handleFileSharePathFavoriteChange(item as FileSharePath);
            break;
          case 'folder':
            await handleFolderFavoriteChange(item as FolderFavorite);
            break;
          default:
            throw new Error(`Invalid type: ${type}`);
        }
      });
    },
    [
      handleZoneFavoriteChange,
      handleFileSharePathFavoriteChange,
      handleFolderFavoriteChange
    ]
  );

  React.useEffect(() => {
    (async function () {
      const result = await fetchPreferences('path');
      const rawPathPreference = result.data as
        | ['linux_path']
        | ['windows_path']
        | ['mac_path']
        | undefined;
      if (rawPathPreference) {
        log.debug('setting initial path preference:', rawPathPreference);
        setPathPreference(rawPathPreference);
      }
    })();
  }, [fetchPreferences]);

  React.useEffect(() => {
    if (!isZonesMapReady) {
      return;
    }

    (async function () {
      const result = await fetchPreferences('zone');
      const backendPrefs = result.data || [];
      const zoneArray =
        backendPrefs?.map((pref: ZonePreference) => {
          const key = makeMapKey(pref.type, pref.name);
          return { [key]: pref };
        }) || [];
      const zoneMap = Object.assign({}, ...zoneArray);
      if (zoneMap) {
        updateLocalZonePreferenceStates(zoneMap);
      }
    })();
  }, [isZonesMapReady, fetchPreferences, updateLocalZonePreferenceStates]);

  React.useEffect(() => {
    if (!isZonesMapReady) {
      return;
    }

    (async function () {
      const result = await fetchPreferences('fileSharePath');
      const backendPrefs = result.data || [];
      const fspArray =
        backendPrefs?.map((pref: FileSharePathPreference) => {
          const key = makeMapKey(pref.type, pref.name);
          return { [key]: pref };
        }) || [];
      const fspMap = Object.assign({}, ...fspArray);
      if (fspMap) {
        updateLocalFspPreferenceStates(fspMap);
      }
    })();
  }, [isZonesMapReady, fetchPreferences, updateLocalFspPreferenceStates]);

  React.useEffect(() => {
    if (!isZonesMapReady) {
      return;
    }

    (async function () {
      const result = await fetchPreferences('folder');
      const backendPrefs = result.data || [];
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
    })();
  }, [isZonesMapReady, fetchPreferences, updateLocalFolderPreferenceStates]);

  return (
    <PreferencesContext.Provider
      value={{
        pathPreference,
        showPathPrefAlert,
        setShowPathPrefAlert,
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
