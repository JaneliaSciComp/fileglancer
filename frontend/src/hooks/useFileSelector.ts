import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { ChangeEvent } from 'react';

import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useProfileContext } from '@/contexts/ProfileContext';
import useFileQuery from '@/queries/fileQueries';
import {
  getPreferredPathForDisplay,
  resolvePathToFsp
} from '@/utils/pathHandling';
import { makeMapKey } from '@/utils';
import { filterFspsByGroupMembership } from '@/utils/groupFiltering';
import { isReadOnlyFsp } from '@/utils/cloudStorage';
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
    fullPath: string; // Path in effective format (may be overridden for server use)
    displayPath: string; // Path in user's preferred format for display
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
  // When true, initialPath points at a file, so the browser opens its parent
  // folder. Leave unset when initialPath is already a folder to open as-is.
  initialPathIsFile?: boolean;
  pathPreferenceOverride?: ['linux_path'];
  // When neither initialLocation nor initialPath resolves to a folder, open in
  // the user's home directory instead of the top-level zones list.
  defaultToHome?: boolean;
  // List cloud storage buckets alongside file shares.
  includeCloud?: boolean;
};

export default function useFileSelector(options?: FileSelectorOptions) {
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const { pathPreference, isFilteredByGroups } = usePreferencesContext();
  const { profile } = useProfileContext();

  const initialLocation = options?.initialLocation;
  const defaultToHome = options?.defaultToHome ?? false;
  const includeCloud = options?.includeCloud ?? false;
  const overrideKey = options?.pathPreferenceOverride?.[0];
  const effectivePathPreference = useMemo(
    () => (overrideKey ? ([overrideKey] as ['linux_path']) : pathPreference),
    [overrideKey, pathPreference]
  );

  // The user's home directory as a filesystem location, when known.
  const homeLocation = useMemo<FileSelectorLocation | undefined>(() => {
    if (!profile?.homeFileSharePathName) {
      return undefined;
    }
    return {
      type: 'filesystem',
      fspName: profile.homeFileSharePathName,
      path: profile.homeDirectoryName || '.'
    };
  }, [profile]);

  // Where the selector starts (and returns to on reset): an explicit
  // initialLocation, else the home directory when defaultToHome is set, else
  // the top-level zones list.
  const defaultLocation = useMemo<FileSelectorLocation>(() => {
    if (initialLocation) {
      return {
        type: 'filesystem',
        fspName: initialLocation.fspName,
        path: initialLocation.path
      };
    }
    if (defaultToHome && homeLocation) {
      return homeLocation;
    }
    return { type: 'zones' };
  }, [initialLocation, defaultToHome, homeLocation]);

  // Initialize location based on the resolved default location
  const [state, setState] = useState<FileSelectorState>({
    currentLocation: defaultLocation,
    selectedItem: null
  });

  // Local-only dot-file visibility for the dialog. Always starts hidden,
  // ignoring the global preference; the user can toggle it within the dialog
  // without ever writing the global preference.
  const [hideDotFilesLocal, setHideDotFilesLocal] = useState<boolean>(true);
  const toggleHideDotFiles = useCallback(() => {
    setHideDotFilesLocal(prev => !prev);
  }, []);

  // If the profile (and thus home) resolves only after mount, apply the home
  // default once, as long as the user hasn't already navigated away.
  const appliedHomeRef = useRef(false);
  useEffect(() => {
    if (!defaultToHome || initialLocation || options?.initialPath) {
      return;
    }
    if (appliedHomeRef.current || !homeLocation) {
      return;
    }
    appliedHomeRef.current = true;
    setState(prev =>
      prev.currentLocation.type === 'zones'
        ? { currentLocation: homeLocation, selectedItem: null }
        : prev
    );
  }, [defaultToHome, initialLocation, options?.initialPath, homeLocation]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const handleSearchChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(event.target.value);
    },
    []
  );

  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const userHasGroups = (profile?.groups?.length ?? 0) > 0;

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

    const resolved = resolvePathToFsp(initialPath, zonesAndFspQuery.data);

    if (resolved) {
      let subPath = resolved.subpath;
      let selectedItem: FileSelectorState['selectedItem'] = null;
      // When initialPath is a file, navigate to its parent directory and keep
      // the file itself selected, so reopening the dialog shows the current
      // value ready to be confirmed or replaced.
      if (subPath && options?.initialPathIsFile) {
        const lastSlash = subPath.lastIndexOf('/');
        selectedItem = {
          name: subPath.slice(lastSlash + 1),
          isDir: false,
          fullPath: getPreferredPathForDisplay(
            effectivePathPreference,
            resolved.fsp,
            subPath
          ),
          displayPath: getPreferredPathForDisplay(
            pathPreference,
            resolved.fsp,
            subPath
          )
        };
        subPath = lastSlash >= 0 ? subPath.slice(0, lastSlash) : '';
      }

      setState({
        currentLocation: {
          type: 'filesystem',
          fspName: resolved.fsp.name,
          path: subPath || '.'
        },
        selectedItem
      });
    }
  }, [
    options?.initialPath,
    options?.initialPathIsFile,
    zonesAndFspQuery.data,
    effectivePathPreference,
    pathPreference
  ]);

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

  // Path to show in the editable path field, in the user's preferred format:
  // the selected item when there is one, otherwise the current folder.
  const currentPathDisplay = useMemo(() => {
    if (state.selectedItem) {
      return state.selectedItem.displayPath;
    }
    if (state.currentLocation.type === 'filesystem' && currentFsp) {
      const subPath =
        state.currentLocation.path === '.' ? '' : state.currentLocation.path;
      return getPreferredPathForDisplay(pathPreference, currentFsp, subPath);
    }
    return '';
  }, [state.selectedItem, state.currentLocation, currentFsp, pathPreference]);

  // Build the items to display based on current location
  const displayItems = useMemo((): FileOrFolder[] => {
    if (zonesAndFspQuery.isPending || !zonesAndFspQuery.data) {
      return [];
    }

    // File shares pass group filtering; cloud buckets belong to no group and
    // are listed only when includeCloud is set.
    const userGroups = profile?.groups || [];
    const visibleFsps = (fsps: FileSharePath[]) => {
      const accessible = new Set(
        filterFspsByGroupMembership(fsps, userGroups, isFilteredByGroups)
      );
      return fsps.filter(fsp =>
        isReadOnlyFsp(fsp) ? includeCloud : accessible.has(fsp)
      );
    };

    if (state.currentLocation.type === 'zones') {
      // Show zones at zones level
      const items: FileOrFolder[] = [];

      // Add zones as folders
      Object.entries(zonesAndFspQuery.data).forEach(([key, value]) => {
        if (key.startsWith('zone_')) {
          const zone = value as Zone;

          // Only show zones that have at least one visible FSP
          if (visibleFsps(zone.fileSharePaths).length === 0) {
            return; // Skip this zone
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

      // Filter zones by search query
      if (normalizedQuery) {
        return items.filter(item =>
          item.name.toLowerCase().includes(normalizedQuery)
        );
      }

      return items;
    } else if (state.currentLocation.type === 'zone') {
      // Show FSPs in the selected zone
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

      const accessibleFsps = visibleFsps(zoneFsps);

      // Filter FSPs by search query
      const searchFilteredFsps = normalizedQuery
        ? accessibleFsps.filter(fsp =>
            fsp.name.toLowerCase().includes(normalizedQuery)
          )
        : accessibleFsps;

      // Convert to FileOrFolder items to display in file selector table
      const items: FileOrFolder[] = searchFilteredFsps.map(fsp => ({
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
      let files = fileQuery.data?.files || [];
      if (hideDotFilesLocal) {
        files = files.filter(item => !item.name.startsWith('.'));
      }
      if (normalizedQuery) {
        return files.filter(item =>
          item.name.toLowerCase().includes(normalizedQuery)
        );
      }
      return files;
    }
  }, [
    state.currentLocation,
    zonesAndFspQuery.data,
    zonesAndFspQuery.isPending,
    fileQuery.data,
    isFilteredByGroups,
    profile,
    includeCloud,
    normalizedQuery,
    hideDotFilesLocal
  ]);

  // Navigation methods
  const navigateToLocation = useCallback((location: FileSelectorLocation) => {
    setSearchQuery('');
    setState({
      currentLocation: location,
      selectedItem: null
    });
  }, []);

  // Resolve a raw path (in any OS format, e.g. pasted by the user) to an FSP
  // and navigate the browser into it. Returns false if no FSP matches.
  const navigateToRawPath = useCallback(
    (rawPath: string): boolean => {
      if (!rawPath.trim() || !zonesAndFspQuery.data) {
        return false;
      }
      const resolved = resolvePathToFsp(rawPath, zonesAndFspQuery.data);
      if (!resolved) {
        return false;
      }
      navigateToLocation({
        type: 'filesystem',
        fspName: resolved.fsp.name,
        path: resolved.subpath || '.'
      });
      return true;
    },
    [zonesAndFspQuery.data, navigateToLocation]
  );

  // Jump to the user's home directory (no-op until the profile resolves).
  const navigateHome = useCallback(() => {
    if (homeLocation) {
      navigateToLocation(homeLocation);
    }
  }, [homeLocation, navigateToLocation]);

  // Reset to initial state (for when dialog is closed/cancelled)
  const reset = useCallback(() => {
    lastResolvedPath.current = undefined;
    setSearchQuery('');
    setHideDotFilesLocal(true);
    setState({
      currentLocation: defaultLocation,
      selectedItem: null
    });
  }, [defaultLocation]);

  // Select an item and generate its full filesystem path
  // If no item provided, selects the current folder/location
  const selectItem = useCallback(
    (item?: FileOrFolder) => {
      // Case 1: No item provided - select the current folder. Runs as a
      // functional update so it composes with a navigation landing in the
      // same commit (e.g. the initialPath resolution on dialog open), and it
      // keeps an existing selection (e.g. the file preselected from
      // initialPath) rather than replacing it with the folder.
      if (!item) {
        setState(prev => {
          if (prev.selectedItem || prev.currentLocation.type !== 'filesystem') {
            return prev;
          }
          const fspKey = makeMapKey('fsp', prev.currentLocation.fspName);
          const fsp = zonesAndFspQuery.data?.[fspKey] as
            | FileSharePath
            | undefined;
          if (!fsp) {
            return prev;
          }

          const subPath =
            prev.currentLocation.path === '.' ? '' : prev.currentLocation.path;
          const fullPath = getPreferredPathForDisplay(
            effectivePathPreference,
            fsp,
            subPath
          );
          if (!fullPath) {
            return prev;
          }

          // Get the folder name from the path
          const pathParts = prev.currentLocation.path
            .split('/')
            .filter(Boolean);
          return {
            ...prev,
            selectedItem: {
              name:
                pathParts.length > 0
                  ? pathParts[pathParts.length - 1]
                  : fsp.name,
              isDir: true,
              fullPath,
              displayPath: getPreferredPathForDisplay(
                pathPreference,
                fsp,
                subPath
              )
            }
          };
        });
        return;
      }

      // Case 2: Item provided - select that item. Files are selectable even
      // in directory mode (and vice versa) — the consumer surfaces a
      // validation error for type mismatches instead of the dialog silently
      // ignoring the click.

      // Don't allow selecting zones - user must select an FSP or folder within FSP
      if (state.currentLocation.type === 'zones') {
        return;
      }

      let fullPath = '';
      let displayPath = '';

      if (state.currentLocation.type === 'zone') {
        // Selecting an FSP
        const fspKey = makeMapKey('fsp', item.name);
        const fsp = zonesAndFspQuery.data?.[fspKey] as FileSharePath;
        if (fsp) {
          fullPath = getPreferredPathForDisplay(effectivePathPreference, fsp);
          displayPath = getPreferredPathForDisplay(pathPreference, fsp);
        }
      } else if (currentFsp) {
        // In filesystem mode, generate path from current FSP + item path
        fullPath = getPreferredPathForDisplay(
          effectivePathPreference,
          currentFsp,
          item.path
        );
        displayPath = getPreferredPathForDisplay(
          pathPreference,
          currentFsp,
          item.path
        );
      }

      // Only set state if we have a valid path
      if (fullPath) {
        setState(prev => ({
          ...prev,
          selectedItem: {
            name: item.name,
            isDir: item.is_dir,
            fullPath,
            displayPath
          }
        }));
      }
    },
    [
      state.currentLocation,
      currentFsp,
      effectivePathPreference,
      pathPreference,
      zonesAndFspQuery.data
    ]
  );

  // Handle double-click navigation
  const handleItemDoubleClick = useCallback(
    (item: FileOrFolder) => {
      if (!item.is_dir) {
        return;
      }

      if (state.currentLocation.type === 'zones') {
        navigateToLocation({ type: 'zone', zoneId: item.name });
      } else if (state.currentLocation.type === 'zone') {
        navigateToLocation({
          type: 'filesystem',
          fspName: item.name,
          path: '.'
        });
      } else if (state.currentLocation.type === 'filesystem') {
        navigateToLocation({
          type: 'filesystem',
          fspName: state.currentLocation.fspName,
          path: item.path
        });
      }
    },
    [state.currentLocation, navigateToLocation]
  );

  return {
    state,
    displayItems,
    fileQuery,
    zonesQuery: zonesAndFspQuery,
    navigateToLocation,
    navigateToRawPath,
    navigateHome,
    currentPathDisplay,
    canGoHome: homeLocation !== undefined,
    selectItem,
    handleItemDoubleClick,
    reset,
    searchQuery,
    handleSearchChange,
    clearSearch,
    isFilteredByGroups,
    userHasGroups,
    hideDotFiles: hideDotFilesLocal,
    toggleHideDotFiles
  };
}
