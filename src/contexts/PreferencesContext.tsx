import React from 'react';
import { default as log } from '@/logger';

import type { FileSharePath, Zone } from '@/shared.types';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { useZoneAndFspMapContext } from './ZonesAndFspMapContext';
import { useFileBrowserContext } from './FileBrowserContext';
import { sendFetchRequest, makeMapKey, HTTPError } from '@/utils';
import { createSuccess, handleError, toHttpError } from '@/utils/errorHandling';
import type { Result } from '@/shared.types';

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
    localPathPreference: PreferencesContextType['pathPreference']
  ) => Promise<Result<void>>;
  hideDotFiles: boolean;
  toggleHideDotFiles: () => Promise<Result<void>>;
  areDataLinksAutomatic: boolean;
  toggleAutomaticDataLinks: () => Promise<Result<void>>;
  disableNeuroglancerStateGeneration: boolean;
  toggleDisableNeuroglancerStateGeneration: () => Promise<Result<void>>;
  disableHeuristicalLayerTypeDetection: boolean;
  toggleDisableHeuristicalLayerTypeDetection: () => Promise<Result<void>>;
  useLegacyMultichannelApproach: boolean;
  toggleUseLegacyMultichannelApproach: () => Promise<Result<void>>;
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
  ) => Promise<Result<boolean>>;
  recentlyViewedFolders: FolderPreference[];
  layout: string;
  handleUpdateLayout: (layout: string) => Promise<void>;
  loadingRecentlyViewedFolders: boolean;
  isLayoutLoadedFromDB: boolean;
  handleContextMenuFavorite: () => Promise<Result<boolean>>;
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
  readonly children: React.ReactNode;
}) => {
  const [pathPreference, setPathPreference] = React.useState<
    ['linux_path'] | ['windows_path'] | ['mac_path']
  >(['linux_path']);
  const [hideDotFiles, setHideDotFiles] = React.useState<boolean>(false);
  const [areDataLinksAutomatic, setAreDataLinksAutomatic] =
    React.useState<boolean>(false);
  const [
    disableNeuroglancerStateGeneration,
    setDisableNeuroglancerStateGeneration
  ] = React.useState<boolean>(false);
  const [
    disableHeuristicalLayerTypeDetection,
    setDisableHeuristicalLayerTypeDetection
  ] = React.useState<boolean>(false);
  const [useLegacyMultichannelApproach, setUseLegacyMultichannelApproach] =
    React.useState<boolean>(false);
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
  const [recentlyViewedFolders, setRecentlyViewedFolders] = React.useState<
    FolderPreference[]
  >([]);
  const [loadingRecentlyViewedFolders, setLoadingRecentlyViewedFolders] =
    React.useState(false);
  const [isFileSharePathFavoritesReady, setIsFileSharePathFavoritesReady] =
    React.useState(false);
  const [layout, setLayout] = React.useState<string>('');
  const [isLayoutLoadedFromDB, setIsLayoutLoadedFromDB] = React.useState(false);

  const { cookies } = useCookiesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const { fileBrowserState } = useFileBrowserContext();

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
          return null; // Preference not found is not an error
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
      if (!zonesAndFspQuery.isSuccess) {
        return;
      }
      const itemsArray = keys.map(key => {
        return zonesAndFspQuery.data[key];
      });
      return itemsArray;
    },
    [zonesAndFspQuery.data, zonesAndFspQuery.isSuccess]
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
      if (!zonesAndFspQuery.isSuccess) {
        return;
      }
      setFolderPreferenceMap(updatedMap);
      const updatedFolderFavorites = Object.entries(updatedMap).map(
        ([_, value]) => {
          const fspKey = makeMapKey('fsp', value.fspName);
          const fsp = zonesAndFspQuery.data[fspKey];
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
    [zonesAndFspQuery.data, zonesAndFspQuery.isSuccess]
  );

  const savePreferencesToBackend = React.useCallback(
    async <T,>(key: string, value: T): Promise<Response> => {
      const response = await sendFetchRequest(
        `/api/fileglancer/preference?key=${key}`,
        'PUT',
        cookies['_xsrf'],
        { value: value }
      );
      if (!response.ok) {
        throw await toHttpError(response);
      } else {
        return response;
      }
    },
    [cookies]
  );

  const handleUpdateLayout = async (layout: string): Promise<void> => {
    await savePreferencesToBackend('layout', layout);
    setLayout(layout);
  };

  const handlePathPreferenceSubmit = React.useCallback(
    async (
      localPathPreference: ['linux_path'] | ['windows_path'] | ['mac_path']
    ): Promise<Result<void>> => {
      try {
        await savePreferencesToBackend('path', localPathPreference);
        setPathPreference(localPathPreference);
      } catch (error) {
        return handleError(error);
      }
      return createSuccess(undefined);
    },
    [savePreferencesToBackend]
  );

  const togglePreference = React.useCallback(
    async <T extends boolean>(
      key: string,
      setter: React.Dispatch<React.SetStateAction<T>>
    ): Promise<Result<void>> => {
      try {
        setter((prevValue: T) => {
          const newValue = !prevValue as T;
          savePreferencesToBackend(key, newValue);
          return newValue;
        });
      } catch (error) {
        return handleError(error);
      }
      return createSuccess(undefined);
    },
    [savePreferencesToBackend]
  );

  const toggleHideDotFiles = React.useCallback(async (): Promise<
    Result<void>
  > => {
    return togglePreference('hideDotFiles', setHideDotFiles);
  }, [togglePreference]);

  const toggleAutomaticDataLinks = React.useCallback(async (): Promise<
    Result<void>
  > => {
    return togglePreference('areDataLinksAutomatic', setAreDataLinksAutomatic);
  }, [togglePreference]);

  const toggleDisableNeuroglancerStateGeneration =
    React.useCallback(async (): Promise<Result<void>> => {
      return togglePreference(
        'disableNeuroglancerStateGeneration',
        setDisableNeuroglancerStateGeneration
      );
    }, [togglePreference]);

  const toggleDisableHeuristicalLayerTypeDetection =
    React.useCallback(async (): Promise<Result<void>> => {
      try {
        setDisableHeuristicalLayerTypeDetection(
          prevDisableHeuristicalLayerTypeDetection => {
            const newValue = !prevDisableHeuristicalLayerTypeDetection;
            savePreferencesToBackend(
              'disableHeuristicalLayerTypeDetection',
              newValue
            );
            return newValue;
          }
        );
      } catch (error) {
        return handleError(error);
      }
      return createSuccess(undefined);
    }, [savePreferencesToBackend]);

  const toggleUseLegacyMultichannelApproach =
    React.useCallback(async (): Promise<Result<void>> => {
      return togglePreference(
        'useLegacyMultichannelApproach',
        setUseLegacyMultichannelApproach
      );
    }, [togglePreference]);

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
    async (item: Zone): Promise<boolean> => {
      const key = makeMapKey('zone', item.name);
      const { updatedFavorites, favoriteAdded } = updatePreferenceList(
        key,
        { type: 'zone', name: item.name },
        zonePreferenceMap
      ) as {
        updatedFavorites: Record<string, ZonePreference>;
        favoriteAdded: boolean;
      };
      await savePreferencesToBackend('zone', Object.values(updatedFavorites));

      updateLocalZonePreferenceStates(updatedFavorites);
      return favoriteAdded;
    },
    [
      zonePreferenceMap,
      savePreferencesToBackend,
      updateLocalZonePreferenceStates
    ]
  );

  const handleFileSharePathFavoriteChange = React.useCallback(
    async (item: FileSharePath): Promise<boolean> => {
      const key = makeMapKey('fsp', item.name);
      const { updatedFavorites, favoriteAdded } = updatePreferenceList(
        key,
        { type: 'fsp', name: item.name },
        fileSharePathPreferenceMap
      ) as {
        updatedFavorites: Record<string, FileSharePathPreference>;
        favoriteAdded: boolean;
      };
      await savePreferencesToBackend(
        'fileSharePath',
        Object.values(updatedFavorites)
      );

      updateLocalFspPreferenceStates(updatedFavorites);
      return favoriteAdded;
    },
    [
      fileSharePathPreferenceMap,
      savePreferencesToBackend,
      updateLocalFspPreferenceStates
    ]
  );

  const handleFolderFavoriteChange = React.useCallback(
    async (item: FolderFavorite): Promise<boolean> => {
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

      await savePreferencesToBackend('folder', Object.values(updatedFavorites));

      updateLocalFolderPreferenceStates(updatedFavorites);
      return favoriteAdded;
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
    ): Promise<Result<boolean>> => {
      let favoriteAdded = false;
      try {
        switch (type) {
          case 'zone':
            favoriteAdded = await handleZoneFavoriteChange(item as Zone);
            break;
          case 'fileSharePath':
            favoriteAdded = await handleFileSharePathFavoriteChange(
              item as FileSharePath
            );
            break;
          case 'folder':
            favoriteAdded = await handleFolderFavoriteChange(
              item as FolderFavorite
            );
            break;
          default:
            return handleError(new Error(`Invalid favorite type: ${type}`));
        }
      } catch (error) {
        return handleError(error);
      }
      return createSuccess(favoriteAdded);
    },
    [
      handleZoneFavoriteChange,
      handleFileSharePathFavoriteChange,
      handleFolderFavoriteChange
    ]
  );

  const handleContextMenuFavorite = async (): Promise<Result<boolean>> => {
    if (fileBrowserState.currentFileSharePath) {
      return await handleFavoriteChange(
        {
          type: 'folder',
          folderPath: fileBrowserState.selectedFiles[0].path,
          fsp: fileBrowserState.currentFileSharePath
        },
        'folder'
      );
    } else {
      return handleError(new Error('No file share path selected'));
    }
  };

  const updateRecentlyViewedFolders = React.useCallback(
    (folderPath: string, fspName: string): FolderPreference[] => {
      const updatedFolders = [...recentlyViewedFolders];

      // Do not save file share paths in the recently viewed folders
      if (folderPath === '.') {
        return updatedFolders;
      }

      const newItem = {
        type: 'folder',
        folderPath: folderPath,
        fspName: fspName
      } as FolderPreference;

      // First, if length is 0, just add the new item
      if (updatedFolders.length === 0) {
        updatedFolders.push(newItem);
        return updatedFolders;
      }
      // Check if folderPath is a descendant path of the most recently viewed folder path
      // Or if it is a direct ancestor of the most recently viewed folder path
      // If it is, replace the most recent item
      if (
        (updatedFolders.length > 0 &&
          folderPath.startsWith(updatedFolders[0].folderPath)) ||
        updatedFolders[0].folderPath.startsWith(folderPath)
      ) {
        updatedFolders[0] = newItem;
        return updatedFolders;
      } else {
        const index = updatedFolders.findIndex(
          folder =>
            folder.folderPath === newItem.folderPath &&
            folder.fspName === newItem.fspName
        );
        if (index === -1) {
          updatedFolders.unshift(newItem);
          if (updatedFolders.length > 10) {
            updatedFolders.pop(); // Remove the oldest entry if we exceed the 10 item limit
          }
        } else if (index > 0) {
          // If the folder is already in the list, move it to the front
          updatedFolders.splice(index, 1);
          updatedFolders.unshift(newItem);
        }
        return updatedFolders;
      }
    },
    [recentlyViewedFolders]
  );

  React.useEffect(() => {
    (async function () {
      if (isLayoutLoadedFromDB) {
        return; // Avoid re-fetching if already loaded
      }
      const rawLayoutPref = await fetchPreferences('layout');
      if (rawLayoutPref) {
        setLayout(rawLayoutPref);
      }
      setIsLayoutLoadedFromDB(true);
    })();
  }, [fetchPreferences, isLayoutLoadedFromDB]);

  React.useEffect(() => {
    (async function () {
      const rawPathPreference = await fetchPreferences('path');
      if (rawPathPreference) {
        setPathPreference(rawPathPreference);
      }
    })();
  }, [fetchPreferences]);

  React.useEffect(() => {
    (async function () {
      const rawHideDotFiles = await fetchPreferences('hideDotFiles');
      if (rawHideDotFiles !== null) {
        setHideDotFiles(rawHideDotFiles);
      }
    })();
  }, [fetchPreferences]);

  React.useEffect(() => {
    (async function () {
      const rawAreDataLinksAutomatic = await fetchPreferences(
        'areDataLinksAutomatic'
      );
      if (rawAreDataLinksAutomatic !== null) {
        setAreDataLinksAutomatic(rawAreDataLinksAutomatic);
      }
    })();
  }, [fetchPreferences]);

  React.useEffect(() => {
    (async function () {
      const rawDisableNeuroglancerStateGeneration = await fetchPreferences(
        'disableNeuroglancerStateGeneration'
      );
      if (rawDisableNeuroglancerStateGeneration !== null) {
        setDisableNeuroglancerStateGeneration(
          rawDisableNeuroglancerStateGeneration
        );
      }
    })();
  }, [fetchPreferences]);

  React.useEffect(() => {
    (async function () {
      const rawDisableHeuristicalLayerTypeDetection = await fetchPreferences(
        'disableHeuristicalLayerTypeDetection'
      );
      if (rawDisableHeuristicalLayerTypeDetection !== null) {
        setDisableHeuristicalLayerTypeDetection(
          rawDisableHeuristicalLayerTypeDetection
        );
      }
    })();
  }, [fetchPreferences]);

  React.useEffect(() => {
    (async function () {
      const rawUseLegacyMultichannelApproach = await fetchPreferences(
        'useLegacyMultichannelApproach'
      );
      if (rawUseLegacyMultichannelApproach !== null) {
        setUseLegacyMultichannelApproach(rawUseLegacyMultichannelApproach);
      }
    })();
  }, [fetchPreferences]);

  React.useEffect(() => {
    if (!zonesAndFspQuery.isSuccess) {
      return;
    }

    (async function () {
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
    })();
  }, [
    fetchPreferences,
    updateLocalZonePreferenceStates,
    zonesAndFspQuery.isSuccess
  ]);

  React.useEffect(() => {
    if (!zonesAndFspQuery.isSuccess) {
      return;
    }

    (async function () {
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
    })();
  }, [
    fetchPreferences,
    updateLocalFspPreferenceStates,
    zonesAndFspQuery.isSuccess
  ]);

  React.useEffect(() => {
    if (!zonesAndFspQuery.isSuccess) {
      return;
    }

    (async function () {
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
    })();
  }, [
    fetchPreferences,
    updateLocalFolderPreferenceStates,
    zonesAndFspQuery.isSuccess
  ]);

  // Get initial recently viewed folders from backend
  React.useEffect(() => {
    setLoadingRecentlyViewedFolders(true);
    if (!zonesAndFspQuery.isSuccess) {
      return;
    }
    (async function () {
      const backendPrefs = (await fetchPreferences(
        'recentlyViewedFolders'
      )) as FolderPreference[];
      if (backendPrefs && backendPrefs.length > 0) {
        setRecentlyViewedFolders(backendPrefs);
      }
      setLoadingRecentlyViewedFolders(false);
    })();
  }, [fetchPreferences, zonesAndFspQuery.isSuccess]);

  // Store last viewed folder path and FSP name to avoid duplicate updates
  const lastFolderPathRef = React.useRef<string | null>(null);
  const lastFspNameRef = React.useRef<string | null>(null);

  // useEffect that runs when the current folder in fileBrowserState changes,
  // to update the recently viewed folder
  React.useEffect(() => {
    if (
      !fileBrowserState.currentFileSharePath ||
      !fileBrowserState.currentFileOrFolder
    ) {
      return;
    }

    const fspName = fileBrowserState.currentFileSharePath.name;
    const folderPath = fileBrowserState.currentFileOrFolder.path;

    // Skip if this is the same folder we just processed
    if (
      lastFspNameRef.current === fspName &&
      lastFolderPathRef.current === folderPath
    ) {
      return;
    }

    // Update references
    lastFspNameRef.current = fspName;
    lastFolderPathRef.current = folderPath;

    // Use a cancel flag
    let isCancelled = false;

    const processUpdate = async () => {
      // If the effect was cleaned up before this async function runs, abort
      if (isCancelled) {
        return;
      }

      try {
        const updatedFolders = updateRecentlyViewedFolders(folderPath, fspName);
        // Check again if cancelled before updating state
        if (isCancelled) {
          return;
        }
        setRecentlyViewedFolders(updatedFolders);
        await savePreferencesToBackend('recentlyViewedFolders', updatedFolders);
      } catch (error) {
        if (!isCancelled) {
          console.error('Error updating recently viewed folders:', error);
        }
      }
    };
    processUpdate();

    return () => {
      isCancelled = true;
    };
  }, [
    fileBrowserState, // Include the whole state object to satisfy ESLint
    updateRecentlyViewedFolders,
    savePreferencesToBackend
  ]);

  return (
    <PreferencesContext.Provider
      value={{
        pathPreference,
        handlePathPreferenceSubmit,
        hideDotFiles,
        toggleHideDotFiles,
        areDataLinksAutomatic,
        toggleAutomaticDataLinks,
        disableNeuroglancerStateGeneration,
        toggleDisableNeuroglancerStateGeneration,
        disableHeuristicalLayerTypeDetection,
        toggleDisableHeuristicalLayerTypeDetection,
        useLegacyMultichannelApproach,
        toggleUseLegacyMultichannelApproach,
        zonePreferenceMap,
        zoneFavorites,
        fileSharePathPreferenceMap,
        fileSharePathFavorites,
        folderPreferenceMap,
        folderFavorites,
        isFileSharePathFavoritesReady,
        handleFavoriteChange,
        recentlyViewedFolders,
        layout,
        handleUpdateLayout,
        loadingRecentlyViewedFolders,
        isLayoutLoadedFromDB,
        handleContextMenuFavorite
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};
