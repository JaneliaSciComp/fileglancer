import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useEffect
} from 'react';
import type { ReactNode } from 'react';

import type { FileSharePath, Zone } from '@/shared.types';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { makeMapKey } from '@/utils';
import { createSuccess, handleError } from '@/utils/errorHandling';
import type { Result } from '@/shared.types';
import {
  LAYOUT_NAME,
  WITH_PROPERTIES_AND_SIDEBAR,
  ONLY_PROPERTIES
} from '@/constants/layoutConstants';
import {
  usePreferencesQuery,
  useUpdatePreferenceMutation,
  useUpdatePreferenceListMutation
} from '@/queries/preferencesQueries';

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
  //Full query for accessing loading/error states
  preferenceQuery: ReturnType<typeof usePreferencesQuery>;

  // Simple preferences
  pathPreference: ['linux_path'] | ['windows_path'] | ['mac_path'];
  layout: string;
  hideDotFiles: boolean;
  areDataLinksAutomatic: boolean;
  disableNeuroglancerStateGeneration: boolean;
  disableHeuristicalLayerTypeDetection: boolean;
  useLegacyMultichannelApproach: boolean;
  isFilteredByGroups: boolean;

  // Favorites
  zoneFavorites: Zone[];
  fileSharePathFavorites: FileSharePath[];
  folderFavorites: FolderFavorite[];

  // Recently viewed
  recentlyViewedFolders: FolderPreference[];

  // Preference maps (for mutation logic)
  zonePreferenceMap: Record<string, ZonePreference>;
  fileSharePathPreferenceMap: Record<string, FileSharePathPreference>;
  folderPreferenceMap: Record<string, FolderPreference>;

  // Convenience functions that wrap mutations
  handlePathPreferenceSubmit: (
    localPathPreference: PreferencesContextType['pathPreference']
  ) => Promise<Result<void>>;
  handleUpdateLayout: (layout: string) => Promise<void>;
  setLayoutWithPropertiesOpen: () => Promise<Result<void>>;
  toggleHideDotFiles: () => Promise<Result<void>>;
  toggleAutomaticDataLinks: () => Promise<Result<void>>;
  toggleDisableNeuroglancerStateGeneration: () => Promise<Result<void>>;
  toggleDisableHeuristicalLayerTypeDetection: () => Promise<Result<void>>;
  toggleUseLegacyMultichannelApproach: () => Promise<Result<void>>;
  toggleFilterByGroups: () => Promise<Result<void>>;
  handleFavoriteChange: (
    item: Zone | FileSharePath | FolderFavorite,
    type: 'zone' | 'fileSharePath' | 'folder'
  ) => Promise<Result<boolean>>;
  handleContextMenuFavorite: () => Promise<Result<boolean>>;
};

const PreferencesContext = createContext<PreferencesContextType | null>(null);

export const usePreferencesContext = () => {
  const context = useContext(PreferencesContext);
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
  readonly children: ReactNode;
}) => {
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const { fileQuery, fileBrowserState, fspName, filePath } =
    useFileBrowserContext();

  const preferencesQuery = usePreferencesQuery(zonesAndFspQuery.data);
  const updatePreferenceMutation = useUpdatePreferenceMutation();
  const updatePreferenceListMutation = useUpdatePreferenceListMutation();

  // Store last viewed folder path and FSP name to avoid duplicate updates
  const lastFolderPathRef = useRef<string | null>(null);
  const lastFspNameRef = useRef<string | null>(null);

  const handleUpdateLayout = async (newLayout: string): Promise<void> => {
    // Don't update if layout hasn't changed
    if (newLayout === preferencesQuery.data?.layout) {
      return;
    }
    await updatePreferenceMutation.mutateAsync({
      key: 'layout',
      value: newLayout
    });
  };

  const setLayoutWithPropertiesOpen = async (): Promise<Result<void>> => {
    try {
      const currentLayout = preferencesQuery.data?.layout || '';
      // Keep sidebar in new layout if it is currently present
      const hasSidebar = currentLayout.includes('sidebar');

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
      await updatePreferenceMutation.mutateAsync({
        key: 'layout',
        value: newLayoutString
      });
      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    }
  };

  const handlePathPreferenceSubmit = async (
    localPathPreference: ['linux_path'] | ['windows_path'] | ['mac_path']
  ): Promise<Result<void>> => {
    try {
      await updatePreferenceMutation.mutateAsync({
        key: 'path',
        value: localPathPreference
      });
      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    }
  };

  const togglePreference = async (
    key: string,
    currentValue: boolean
  ): Promise<Result<void>> => {
    try {
      await updatePreferenceMutation.mutateAsync({
        key,
        value: !currentValue
      });
      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    }
  };

  const toggleFilterByGroups = async (): Promise<Result<void>> => {
    return await togglePreference(
      'isFilteredByGroups',
      preferencesQuery.data?.isFilteredByGroups ?? true
    );
  };

  const toggleHideDotFiles = async (): Promise<Result<void>> => {
    return togglePreference(
      'hideDotFiles',
      preferencesQuery.data?.hideDotFiles || false
    );
  };

  const toggleAutomaticDataLinks = async (): Promise<Result<void>> => {
    return togglePreference(
      'areDataLinksAutomatic',
      preferencesQuery.data?.areDataLinksAutomatic ?? true
    );
  };

  const toggleDisableNeuroglancerStateGeneration = async (): Promise<
    Result<void>
  > => {
    return togglePreference(
      'disableNeuroglancerStateGeneration',
      preferencesQuery.data?.disableNeuroglancerStateGeneration || false
    );
  };

  const toggleDisableHeuristicalLayerTypeDetection = async (): Promise<
    Result<void>
  > => {
    return togglePreference(
      'disableHeuristicalLayerTypeDetection',
      preferencesQuery.data?.disableHeuristicalLayerTypeDetection || false
    );
  };

  const toggleUseLegacyMultichannelApproach = async (): Promise<
    Result<void>
  > => {
    return togglePreference(
      'useLegacyMultichannelApproach',
      preferencesQuery.data?.useLegacyMultichannelApproach || false
    );
  };

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

  const handleZoneFavoriteChange = async (item: Zone): Promise<boolean> => {
    const key = makeMapKey('zone', item.name);
    const { updatedFavorites, favoriteAdded } = updatePreferenceList(
      key,
      { type: 'zone', name: item.name },
      preferencesQuery.data?.zonePreferenceMap || {}
    ) as {
      updatedFavorites: Record<string, ZonePreference>;
      favoriteAdded: boolean;
    };
    await updatePreferenceListMutation.mutateAsync({
      preferenceKey: 'zone',
      updatedMap: updatedFavorites
    });
    return favoriteAdded;
  };

  const handleFileSharePathFavoriteChange = async (
    item: FileSharePath
  ): Promise<boolean> => {
    const key = makeMapKey('fsp', item.name);
    const { updatedFavorites, favoriteAdded } = updatePreferenceList(
      key,
      { type: 'fsp', name: item.name },
      preferencesQuery.data?.fileSharePathPreferenceMap || {}
    ) as {
      updatedFavorites: Record<string, FileSharePathPreference>;
      favoriteAdded: boolean;
    };
    await updatePreferenceListMutation.mutateAsync({
      preferenceKey: 'fileSharePath',
      updatedMap: updatedFavorites
    });
    return favoriteAdded;
  };

  const handleFolderFavoriteChange = async (
    item: FolderFavorite
  ): Promise<boolean> => {
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
      preferencesQuery.data?.folderPreferenceMap || {}
    ) as {
      updatedFavorites: Record<string, FolderPreference>;
      favoriteAdded: boolean;
    };
    await updatePreferenceListMutation.mutateAsync({
      preferenceKey: 'folder',
      updatedMap: updatedFavorites
    });
    return favoriteAdded;
  };

  const handleFavoriteChange = async (
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
  };

  const handleContextMenuFavorite = async (): Promise<Result<boolean>> => {
    if (fileQuery.data?.currentFileSharePath) {
      return await handleFavoriteChange(
        {
          type: 'folder',
          folderPath: fileBrowserState.selectedFiles[0].path,
          fsp: fileQuery.data.currentFileSharePath
        },
        'folder'
      );
    } else {
      return handleError(new Error('No file share path selected'));
    }
  };

  const updateRecentlyViewedFolders = useCallback(
    (
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
    },
    []
  );

  // useEffect that runs when the current folder in fileBrowserState changes,
  // to update the recently viewed folder
  useEffect(() => {
    if (
      fileQuery.isPending ||
      !fileQuery.data ||
      !fileQuery.data.currentFileSharePath ||
      !fileQuery.data.currentFileOrFolder
    ) {
      return;
    }

    if (preferencesQuery.isPending) {
      return;
    }

    // Skip if this is the same folder we just processed
    if (
      lastFspNameRef.current === fspName &&
      lastFolderPathRef.current === filePath
    ) {
      return;
    }

    // Update references
    lastFspNameRef.current = fspName;
    lastFolderPathRef.current = filePath;

    // Calculate updated folders and trigger mutation
    const updatedFolders = updateRecentlyViewedFolders(
      filePath,
      fspName,
      preferencesQuery.data?.recentlyViewedFolders || []
    );

    updatePreferenceListMutation.mutate({
      preferenceKey: 'recentlyViewedFolders',
      updatedArray: updatedFolders
    });
  }, [
    updateRecentlyViewedFolders,
    updatePreferenceListMutation,
    preferencesQuery.data?.recentlyViewedFolders,
    preferencesQuery.isPending,
    fileQuery.isPending,
    fileQuery,
    fspName,
    filePath
  ]);

  const value: PreferencesContextType = {
    // Full query for accessing loading/error states
    preferenceQuery: preferencesQuery,

    // Simple preferences
    pathPreference: preferencesQuery.data?.pathPreference || ['linux_path'],
    layout: preferencesQuery.data?.layout || '',
    hideDotFiles: preferencesQuery.data?.hideDotFiles || false,
    areDataLinksAutomatic:
      preferencesQuery.data?.areDataLinksAutomatic ?? false,
    disableNeuroglancerStateGeneration:
      preferencesQuery.data?.disableNeuroglancerStateGeneration || false,
    disableHeuristicalLayerTypeDetection:
      preferencesQuery.data?.disableHeuristicalLayerTypeDetection || false,
    useLegacyMultichannelApproach:
      preferencesQuery.data?.useLegacyMultichannelApproach || false,
    isFilteredByGroups: preferencesQuery.data?.isFilteredByGroups ?? true,

    // Favorites
    zoneFavorites: preferencesQuery.data?.zoneFavorites || [],
    fileSharePathFavorites: preferencesQuery.data?.fileSharePathFavorites || [],
    folderFavorites: preferencesQuery.data?.folderFavorites || [],

    // Recently viewed
    recentlyViewedFolders: preferencesQuery.data?.recentlyViewedFolders || [],

    // Preference maps (for mutation logic)
    zonePreferenceMap: preferencesQuery.data?.zonePreferenceMap || {},
    fileSharePathPreferenceMap:
      preferencesQuery.data?.fileSharePathPreferenceMap || {},
    folderPreferenceMap: preferencesQuery.data?.folderPreferenceMap || {},

    // Convenience functions that wrap mutations
    handlePathPreferenceSubmit,
    handleUpdateLayout,
    setLayoutWithPropertiesOpen,
    toggleHideDotFiles,
    toggleAutomaticDataLinks,
    toggleDisableNeuroglancerStateGeneration,
    toggleDisableHeuristicalLayerTypeDetection,
    toggleUseLegacyMultichannelApproach,
    toggleFilterByGroups,
    handleFavoriteChange,
    handleContextMenuFavorite
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
};
