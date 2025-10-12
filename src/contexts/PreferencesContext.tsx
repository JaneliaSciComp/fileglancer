import React from 'react';
import { default as log } from '@/logger';

import type { FileSharePath, Zone } from '@/shared.types';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { sendFetchRequest, makeMapKey, HTTPError } from '@/utils';
import { createSuccess, handleError, toHttpError } from '@/utils/errorHandling';
import type { Result } from '@/shared.types';
import {
  LAYOUT_NAME,
  WITH_PROPERTIES_AND_SIDEBAR,
  ONLY_PROPERTIES
} from '@/constants/layoutConstants';

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
  setLayoutWithPropertiesOpen: () => Promise<Result<void>>;
  loadingRecentlyViewedFolders: boolean;
  isLayoutLoadedFromDB: boolean;
  handleContextMenuFavorite: () => Promise<Result<boolean>>;
  isFilteredByGroups: boolean;
  toggleFilterByGroups: () => Promise<Result<void>>;
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

  // Default to true for filtering by groups
  const [isFilteredByGroups, setIsFilteredByGroups] =
    React.useState<boolean>(true);

  const { cookies } = useCookiesContext();
  const { isZonesMapReady, zonesAndFileSharePathsMap } =
    useZoneAndFspMapContext();
  const { fileBrowserState } = useFileBrowserContext();

  const fetchPreferences = React.useCallback(async () => {
    try {
      const data = await sendFetchRequest(
        `/api/preference`,
        'GET',
        cookies['_xsrf']
      ).then(response => response.json());
      return data;
    } catch (error) {
      if (error instanceof HTTPError && error.responseCode === 404) {
        return {}; // No preferences found, return empty object
      } else {
        log.error(`Error fetching preferences:`, error);
      }
      return {};
    }
  }, [cookies]);

  const accessMapItems = React.useCallback(
    (keys: string[]) => {
      const itemsArray = keys
        .map(key => zonesAndFileSharePathsMap[key])
        .filter(item => item !== undefined);
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
    async <T,>(key: string, value: T): Promise<Response> => {
      const response = await sendFetchRequest(
        `/api/preference/${key}`,
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

  const setLayoutWithPropertiesOpen = async (): Promise<Result<void>> => {
    try {
      // Keep sidebar in new layout if it is currently present
      const hasSidebar = layout.includes('sidebar');

      const layoutKey = hasSidebar
        ? WITH_PROPERTIES_AND_SIDEBAR
        : ONLY_PROPERTIES;

      const layoutSizes = hasSidebar ? [24, 50, 26] : [75, 25];

      const newLayout = {
        [LAYOUT_NAME]: {
          [layoutKey]: {
            expandToSizes: {},
            layout: layoutSizes
          }
        }
      };
      const newLayoutString = JSON.stringify(newLayout);
      await savePreferencesToBackend('layout', newLayoutString);
      setLayout(newLayoutString);
      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    }
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

  const toggleFilterByGroups = React.useCallback(async (): Promise<
    Result<void>
  > => {
    return await togglePreference('isFilteredByGroups', setIsFilteredByGroups);
  }, [togglePreference]);

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

  // Fetch all preferences on mount
  React.useEffect(() => {
    if (!isZonesMapReady) {
      return;
    }
    if (isLayoutLoadedFromDB) {
      return; // Avoid re-fetching if already loaded
    }

    setLoadingRecentlyViewedFolders(true);

    (async function () {
      const allPrefs = await fetchPreferences();

      // Zone favorites
      const zoneBackendPrefs = allPrefs.zone?.value;
      const zoneArray =
        zoneBackendPrefs?.map((pref: ZonePreference) => {
          const key = makeMapKey(pref.type, pref.name);
          return { [key]: pref };
        }) || [];
      const zoneMap = Object.assign({}, ...zoneArray);
      if (Object.keys(zoneMap).length > 0) {
        updateLocalZonePreferenceStates(zoneMap);
      }

      // FileSharePath favorites
      const fspBackendPrefs = allPrefs.fileSharePath?.value;
      const fspArray =
        fspBackendPrefs?.map((pref: FileSharePathPreference) => {
          const key = makeMapKey(pref.type, pref.name);
          return { [key]: pref };
        }) || [];
      const fspMap = Object.assign({}, ...fspArray);
      if (Object.keys(fspMap).length > 0) {
        updateLocalFspPreferenceStates(fspMap);
      }

      // Folder favorites
      const folderBackendPrefs = allPrefs.folder?.value;
      const folderArray =
        folderBackendPrefs?.map((pref: FolderPreference) => {
          const key = makeMapKey(
            pref.type,
            `${pref.fspName}_${pref.folderPath}`
          );
          return { [key]: pref };
        }) || [];
      const folderMap = Object.assign({}, ...folderArray);
      if (Object.keys(folderMap).length > 0) {
        updateLocalFolderPreferenceStates(folderMap);
      }

      // Recently viewed folders
      const recentlyViewedBackendPrefs = allPrefs.recentlyViewedFolders?.value;
      if (recentlyViewedBackendPrefs && recentlyViewedBackendPrefs.length > 0) {
        setRecentlyViewedFolders(recentlyViewedBackendPrefs);
      }

      // Layout preference
      if (allPrefs.layout?.value) {
        setLayout(allPrefs.layout.value);
      }

      // Path preference
      if (allPrefs.path?.value) {
        setPathPreference(allPrefs.path.value);
      }

      // Boolean preferences
      if (allPrefs.isFilteredByGroups?.value !== undefined) {
        setIsFilteredByGroups(allPrefs.isFilteredByGroups.value);
      }
      if (allPrefs.hideDotFiles?.value !== undefined) {
        setHideDotFiles(allPrefs.hideDotFiles.value);
      }
      if (allPrefs.areDataLinksAutomatic?.value !== undefined) {
        setAreDataLinksAutomatic(allPrefs.areDataLinksAutomatic.value);
      }
      if (allPrefs.disableNeuroglancerStateGeneration?.value !== undefined) {
        setDisableNeuroglancerStateGeneration(
          allPrefs.disableNeuroglancerStateGeneration.value
        );
      }
      if (allPrefs.disableHeuristicalLayerTypeDetection?.value !== undefined) {
        setDisableHeuristicalLayerTypeDetection(
          allPrefs.disableHeuristicalLayerTypeDetection.value
        );
      }
      if (allPrefs.useLegacyMultichannelApproach?.value !== undefined) {
        setUseLegacyMultichannelApproach(
          allPrefs.useLegacyMultichannelApproach.value
        );
      }
      setLoadingRecentlyViewedFolders(false);
      setIsLayoutLoadedFromDB(true);
    })();
  }, [
    fetchPreferences,
    isZonesMapReady,
    isLayoutLoadedFromDB,
    updateLocalZonePreferenceStates,
    updateLocalFspPreferenceStates,
    updateLocalFolderPreferenceStates
  ]);

  // Store last viewed folder path and FSP name to avoid duplicate updates
  const lastFolderPathRef = React.useRef<string | null>(null);
  const lastFspNameRef = React.useRef<string | null>(null);

  const updateRecentlyViewedFolders = (
    folderPath: string,
    fspName: string,
    currentRecentlyViewedFolders: FolderPreference[]
  ): FolderPreference[] => {
    const updatedFolders = [...currentRecentlyViewedFolders];

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
  };

  // useEffect that runs when the current folder in fileBrowserState changes,
  // to update the recently viewed folder
  React.useEffect(() => {
    if (
      !fileBrowserState.currentFileSharePath ||
      !fileBrowserState.currentFileOrFolder
    ) {
      return;
    }

    if (loadingRecentlyViewedFolders) {
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
        const updatedFolders = updateRecentlyViewedFolders(
          folderPath,
          fspName,
          recentlyViewedFolders
        );
        // Check again if cancelled before updating state
        if (isCancelled) {
          return;
        }
        setRecentlyViewedFolders(updatedFolders);
        await savePreferencesToBackend('recentlyViewedFolders', updatedFolders);
      } catch (error) {
        if (!isCancelled) {
          log.error('Error updating recently viewed folders:', error);
        }
      }
    };
    processUpdate();

    return () => {
      isCancelled = true;
    };
  }, [
    fileBrowserState, // Include the whole state object to satisfy ESLint
    recentlyViewedFolders,
    savePreferencesToBackend,
    loadingRecentlyViewedFolders
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
        setLayoutWithPropertiesOpen,
        loadingRecentlyViewedFolders,
        isLayoutLoadedFromDB,
        handleContextMenuFavorite,
        isFilteredByGroups,
        toggleFilterByGroups
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};
