import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useProfileContext } from '@/contexts/ProfileContext';
import useFileQuery from '@/queries/fileQueries';
import { getPreferredPathForDisplay } from '@/utils/pathHandling';
import { makeMapKey } from '@/utils';
import { filterFspsByGroupMembership } from '@/utils/groupFiltering';
import type { FileOrFolder, FileSharePath, Zone } from '@/shared.types';

export type FileSelectorLocation =
  | { type: 'zones' } // Top level: all zones
  | { type: 'zone'; zoneId: string } // Inside a single zone: File share paths (FSPs)
  | { type: 'filesystem'; fspName: string; path: string }; // Inside FSP: files/folders

type FileSelectorState = {
  currentLocation: FileSelectorLocation;
  selectedItem: {
    name: string;
    isDir: boolean;
    fullPath: string; // Full filesystem path in preferred format
  } | null;
};

export type FileSelectorInitialLocation = {
  fspName: string;
  path: string;
};

export type FileSelectorMode = 'file' | 'directory' | 'any';

type FileSelectorOptions = {
  initialLocation?: FileSelectorInitialLocation;
  initialPath?: string;
  mode?: FileSelectorMode;
  pathPreferenceOverride?: ['linux_path'];
};

export default function useFileSelector(options?: FileSelectorOptions) {
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const { pathPreference, isFilteredByGroups } = usePreferencesContext();
  const { profile } = useProfileContext();

  const initialLocation = options?.initialLocation;
  const mode = options?.mode ?? 'any';
  const overrideKey = options?.pathPreferenceOverride?.[0];
  const effectivePathPreference = useMemo(
    () => (overrideKey ? ([overrideKey] as ['linux_path']) : pathPreference),
    [overrideKey, pathPreference]
  );

  // Initialize location based on initialLocation prop
  const [state, setState] = useState<FileSelectorState>({
    currentLocation: initialLocation
      ? {
          type: 'filesystem',
          fspName: initialLocation.fspName,
          path: initialLocation.path
        }
      : { type: 'zones' },
    selectedItem: null
  });

  // Resolve initialPath (raw filesystem path) to FSP + relative path
  const lastResolvedPath = useRef<string | undefined>(undefined);
  useEffect(() => {
    const initialPath = options?.initialPath;
    if (
      !initialPath ||
      !zonesAndFspQuery.data ||
      initialPath === lastResolvedPath.current
    ) {
      return;
    }
    lastResolvedPath.current = initialPath;

    // Find the FSP whose mount_path is the longest prefix of initialPath
    let bestFsp: FileSharePath | null = null;
    let bestMountPath = '';
    for (const [key, value] of Object.entries(zonesAndFspQuery.data)) {
      if (!key.startsWith('fsp_')) {
        continue;
      }
      const fsp = value as FileSharePath;
      const mountPath = fsp.mount_path;
      if (
        mountPath &&
        initialPath.startsWith(mountPath) &&
        mountPath.length > bestMountPath.length
      ) {
        // Ensure it's a proper prefix (matches at a path boundary)
        const rest = initialPath.slice(mountPath.length);
        if (rest === '' || rest.startsWith('/')) {
          bestFsp = fsp;
          bestMountPath = mountPath;
        }
      }
    }

    if (bestFsp) {
      let subPath = initialPath.slice(bestMountPath.length);
      // Remove leading slash from subpath
      if (subPath.startsWith('/')) {
        subPath = subPath.slice(1);
      }
      // For file mode, navigate to the parent directory
      if (subPath && mode !== 'directory') {
        const lastSlash = subPath.lastIndexOf('/');
        if (lastSlash >= 0) {
          subPath = subPath.slice(0, lastSlash);
        } else {
          subPath = '';
        }
      }

      setState({
        currentLocation: {
          type: 'filesystem',
          fspName: bestFsp.name,
          path: subPath || '.'
        },
        selectedItem: null
      });
    }
  }, [options?.initialPath, zonesAndFspQuery.data, mode]);

  // Fetch file data only when in filesystem mode
  const fileQuery = useFileQuery(
    state.currentLocation.type === 'filesystem'
      ? state.currentLocation.fspName
      : undefined,
    state.currentLocation.type === 'filesystem'
      ? state.currentLocation.path || '.'
      : '.'
  );

  // Get current FSP data when in filesystem mode
  const currentFsp = useMemo(() => {
    if (state.currentLocation.type !== 'filesystem') {
      return null;
    }
    const fspKey = makeMapKey('fsp', state.currentLocation.fspName);
    return (zonesAndFspQuery.data?.[fspKey] as FileSharePath) || null;
  }, [state.currentLocation, zonesAndFspQuery.data]);

  // Build the items to display based on current location
  const displayItems = useMemo((): FileOrFolder[] => {
    if (zonesAndFspQuery.isPending || !zonesAndFspQuery.data) {
      return [];
    }

    if (state.currentLocation.type === 'zones') {
      // Show zones at zones level
      const items: FileOrFolder[] = [];

      // Add zones as folders
      const userGroups = profile?.groups || [];
      Object.entries(zonesAndFspQuery.data).forEach(([key, value]) => {
        if (key.startsWith('zone_')) {
          const zone = value as Zone;

          // If group filtering is enabled, only show zones that have at least one accessible FSP
          if (isFilteredByGroups && userGroups.length > 0) {
            const accessibleFsps = filterFspsByGroupMembership(
              zone.fileSharePaths,
              userGroups,
              isFilteredByGroups
            );
            if (accessibleFsps.length === 0) {
              return; // Skip this zone
            }
          }

          items.push({
            name: zone.name,
            path: zone.name,
            is_dir: true,
            size: 0,
            permissions: '',
            owner: '',
            group: '',
            last_modified: 0
          });
        }
      });

      return items;
    } else if (state.currentLocation.type === 'zone') {
      // Show FSPs in the selected zone
      const userGroups = profile?.groups || [];
      const zoneId = state.currentLocation.zoneId;

      // Collect all FSPs for this zone
      const zoneFsps: FileSharePath[] = [];
      Object.entries(zonesAndFspQuery.data).forEach(([key, value]) => {
        if (key.startsWith('fsp_')) {
          const fsp = value as FileSharePath;
          if (fsp.zone === zoneId) {
            zoneFsps.push(fsp);
          }
        }
      });

      // Filter FSPs by group membership
      const accessibleFsps = filterFspsByGroupMembership(
        zoneFsps,
        userGroups,
        isFilteredByGroups
      );

      // Convert to FileOrFolder items to display in file selector table
      const items: FileOrFolder[] = accessibleFsps.map(fsp => ({
        name: fsp.name,
        path: fsp.name,
        is_dir: true,
        size: 0,
        permissions: '',
        owner: '',
        group: '',
        last_modified: 0
      }));

      return items;
    } else {
      // In filesystem mode, return files from query
      return fileQuery.data?.files || [];
    }
  }, [
    state.currentLocation,
    zonesAndFspQuery.data,
    zonesAndFspQuery.isPending,
    fileQuery.data,
    isFilteredByGroups,
    profile
  ]);

  // Navigation methods
  const navigateToLocation = (location: FileSelectorLocation) => {
    setState({
      currentLocation: location,
      selectedItem: null
    });
  };

  // Reset to initial state (for when dialog is closed/cancelled)
  const reset = useCallback(() => {
    lastResolvedPath.current = undefined;
    setState({
      currentLocation: initialLocation
        ? {
            type: 'filesystem',
            fspName: initialLocation.fspName,
            path: initialLocation.path
          }
        : { type: 'zones' },
      selectedItem: null
    });
  }, [initialLocation]);

  // Select an item and generate its full filesystem path
  // If no item provided, selects the current folder/location
  const selectItem = useCallback(
    (item?: FileOrFolder) => {
      let fullPath = '';
      let name = '';
      let isDir = true;

      // Case 1: No item provided - select current folder
      if (!item) {
        if (state.currentLocation.type !== 'filesystem' || !currentFsp) {
          // Can't select current location at zones or zone level
          return;
        }

        fullPath = getPreferredPathForDisplay(
          effectivePathPreference,
          currentFsp,
          state.currentLocation.path === '.' ? '' : state.currentLocation.path
        );

        // Get the folder name from the path
        const pathParts = state.currentLocation.path.split('/').filter(Boolean);
        name =
          pathParts.length > 0
            ? pathParts[pathParts.length - 1]
            : currentFsp.name;
      } else {
        // Case 2: Item provided - select that item
        // Only reject files in directory mode
        if (!item.is_dir && mode === 'directory') {
          return;
        }

        // Don't allow selecting zones - user must select an FSP or folder within FSP
        if (state.currentLocation.type === 'zones') {
          return;
        }

        if (state.currentLocation.type === 'zone') {
          // Selecting an FSP
          const fspKey = makeMapKey('fsp', item.name);
          const fsp = zonesAndFspQuery.data?.[fspKey] as FileSharePath;
          if (fsp) {
            fullPath = getPreferredPathForDisplay(effectivePathPreference, fsp);
          }
        } else if (currentFsp) {
          // In filesystem mode, generate path from current FSP + item path
          fullPath = getPreferredPathForDisplay(
            effectivePathPreference,
            currentFsp,
            item.path
          );
        }

        name = item.name;
        isDir = item.is_dir;
      }

      // Only set state if we have a valid path
      if (fullPath) {
        setState(prev => ({
          ...prev,
          selectedItem: {
            name,
            isDir,
            fullPath
          }
        }));
      }
    },
    [
      state.currentLocation,
      currentFsp,
      effectivePathPreference,
      mode,
      zonesAndFspQuery.data
    ]
  );

  // Handle double-click navigation
  const handleItemDoubleClick = useCallback(
    (item: FileOrFolder) => {
      if (!item.is_dir) {
        // Can't navigate into files
        return;
      }

      if (state.currentLocation.type === 'zones') {
        // Navigate to zone
        setState({
          currentLocation: { type: 'zone', zoneId: item.name },
          selectedItem: null
        });
      } else if (state.currentLocation.type === 'zone') {
        // Navigate to FSP
        setState({
          currentLocation: {
            type: 'filesystem',
            fspName: item.name,
            path: '.'
          },
          selectedItem: null
        });
      } else if (state.currentLocation.type === 'filesystem') {
        // Navigate to folder
        setState({
          currentLocation: {
            type: 'filesystem',
            fspName: state.currentLocation.fspName,
            path: item.path
          },
          selectedItem: null
        });
      }
    },
    [state.currentLocation]
  );

  return {
    state,
    displayItems,
    fileQuery,
    zonesQuery: zonesAndFspQuery,
    navigateToLocation,
    selectItem,
    handleItemDoubleClick,
    reset
  };
}
