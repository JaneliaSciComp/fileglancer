import React from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult
} from '@tanstack/react-query';

import { sendFetchRequest, makeMapKey, HTTPError } from '@/utils';
import { toHttpError } from '@/utils/errorHandling';
import type {
  FileSharePath,
  Zone,
  ZonesAndFileSharePathsMap
} from '@/shared.types';
import type {
  ZonePreference,
  FileSharePathPreference,
  FolderPreference,
  FolderFavorite
} from '@/contexts/PreferencesContext';

/**
 * Raw API response structure from /api/preference endpoint
 */
type PreferencesApiResponse = {
  path?: { value: ['linux_path'] | ['windows_path'] | ['mac_path'] };
  layout?: { value: string };
  hideDotFiles?: { value: boolean };
  areDataLinksAutomatic?: { value: boolean };
  disableNeuroglancerStateGeneration?: { value: boolean };
  disableHeuristicalLayerTypeDetection?: { value: boolean };
  useLegacyMultichannelApproach?: { value: boolean };
  isFilteredByGroups?: { value: boolean };
  zone?: { value: ZonePreference[] };
  fileSharePath?: { value: FileSharePathPreference[] };
  folder?: { value: FolderPreference[] };
  recentlyViewedFolders?: { value: FolderPreference[] };
};

/**
 * Transformed query data - what components consume
 */
export type PreferencesQueryData = {
  // Raw preference maps (used for mutation logic)
  zonePreferenceMap: Record<string, ZonePreference>;
  fileSharePathPreferenceMap: Record<string, FileSharePathPreference>;
  folderPreferenceMap: Record<string, FolderPreference>;

  // Transformed favorites (ready to use - no derivation needed in context)
  zoneFavorites: Zone[];
  fileSharePathFavorites: FileSharePath[];
  folderFavorites: FolderFavorite[];

  recentlyViewedFolders: FolderPreference[];
  pathPreference: ['linux_path'] | ['windows_path'] | ['mac_path'];
  layout: string;
  hideDotFiles: boolean;
  areDataLinksAutomatic: boolean;
  disableNeuroglancerStateGeneration: boolean;
  disableHeuristicalLayerTypeDetection: boolean;
  useLegacyMultichannelApproach: boolean;
  isFilteredByGroups: boolean;
};

/**
 * Payload for updating a single preference
 */
type UpdatePreferencePayload<T = unknown> = {
  key: string;
  value: T;
};

/**
 * Payload for updating favorites
 */
type FavoriteUpdatePayload = {
  preferenceKey: 'zone' | 'fileSharePath' | 'folder';
  updatedMap: Record<
    string,
    ZonePreference | FileSharePathPreference | FolderPreference
  >;
};

// Query key factory for preferences
export const preferencesQueryKeys = {
  all: ['preferences'] as const,
  detail: (key: string) => [...preferencesQueryKeys.all, key] as const
};

/**
 * Fetches all preferences from the backend
 * Returns empty object if no preferences exist (404)
 */
const fetchPreferences = async (): Promise<PreferencesApiResponse> => {
  try {
    const response = await sendFetchRequest('/api/preference', 'GET');
    if (!response.ok && response.status === 404) {
      return {}; // No preferences found, return empty object
    }
    return await response.json();
  } catch (error) {
    if (error instanceof HTTPError && error.responseCode === 404) {
      return {}; // No preferences found
    }
    throw error;
  }
};

const createTransformPreferences = (
  zonesAndFspMap: ZonesAndFileSharePathsMap | undefined
) => {
  return (rawData: PreferencesApiResponse): PreferencesQueryData => {
    // Convert array of preferences to keyed map for efficient lookups
    const createPreferenceMap = <
      T extends {
        type: string;
        name?: string;
        fspName?: string;
        folderPath?: string;
      }
    >(
      items: T[] | undefined
    ): Record<string, T> => {
      if (!items) {
        return {};
      }
      return items.reduce(
        (acc, item) => {
          let key: string;
          if (item.type === 'zone' && item.name) {
            key = makeMapKey('zone', item.name);
          } else if (item.type === 'fsp' && item.name) {
            key = makeMapKey('fsp', item.name);
          } else if (
            item.type === 'folder' &&
            item.fspName &&
            item.folderPath
          ) {
            key = makeMapKey('folder', `${item.fspName}_${item.folderPath}`);
          } else {
            return acc;
          }
          acc[key] = item;
          return acc;
        },
        {} as Record<string, T>
      );
    };

    // Create preference maps
    const zonePreferenceMap = createPreferenceMap(rawData.zone?.value);
    const fileSharePathPreferenceMap = createPreferenceMap(
      rawData.fileSharePath?.value
    );
    const folderPreferenceMap = createPreferenceMap(rawData.folder?.value);

    // Transform zone preferences to Zone objects
    const zoneFavorites = zonesAndFspMap
      ? Object.keys(zonePreferenceMap)
          .map(key => zonesAndFspMap[key] as Zone)
          .filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    // Transform FSP preferences to FileSharePath objects
    const fileSharePathFavorites = zonesAndFspMap
      ? Object.keys(fileSharePathPreferenceMap)
          .map(key => zonesAndFspMap[key] as FileSharePath)
          .filter(Boolean)
          .sort((a, b) => a.storage.localeCompare(b.storage))
      : [];

    // Transform folder preferences to FolderFavorite objects
    const folderFavorites = zonesAndFspMap
      ? Object.values(folderPreferenceMap)
          .map(pref => {
            const fspKey = makeMapKey('fsp', pref.fspName);
            const fsp = zonesAndFspMap[fspKey] as FileSharePath;
            if (!fsp) {
              return null;
            }
            return {
              type: 'folder' as const,
              folderPath: pref.folderPath,
              fsp
            };
          })
          .filter((item): item is FolderFavorite => item !== null)
          .sort((a, b) => {
            const aLastSegment = a.folderPath.split('/').pop() || '';
            const bLastSegment = b.folderPath.split('/').pop() || '';
            return aLastSegment.localeCompare(bLastSegment);
          })
      : [];

    return {
      // Raw maps (for mutation logic)
      zonePreferenceMap,
      fileSharePathPreferenceMap,
      folderPreferenceMap,

      // Transformed favorites (ready to use)
      zoneFavorites,
      fileSharePathFavorites,
      folderFavorites,

      recentlyViewedFolders: rawData.recentlyViewedFolders?.value || [],
      pathPreference: rawData.path?.value || ['linux_path'],
      layout: rawData.layout?.value || '',
      hideDotFiles: rawData.hideDotFiles?.value || false,
      areDataLinksAutomatic: rawData.areDataLinksAutomatic?.value ?? true,
      disableNeuroglancerStateGeneration:
        rawData.disableNeuroglancerStateGeneration?.value || false,
      disableHeuristicalLayerTypeDetection:
        rawData.disableHeuristicalLayerTypeDetection?.value || false,
      useLegacyMultichannelApproach:
        rawData.useLegacyMultichannelApproach?.value || false,
      isFilteredByGroups: rawData.isFilteredByGroups?.value ?? true
    };
  };
};

/**
 * Main query hook for fetching and transforming preferences
 *
 * @param zonesAndFspMap - Map of zones and file share paths (required for favorites transformation)
 * @returns Query result with transformed preferences data
 */
export function usePreferencesQuery(
  zonesAndFspMap: ZonesAndFileSharePathsMap | undefined
): UseQueryResult<PreferencesQueryData, Error> {
  const transformPreferences = React.useMemo(
    () => createTransformPreferences(zonesAndFspMap),
    [zonesAndFspMap]
  );

  return useQuery<PreferencesApiResponse, Error, PreferencesQueryData>({
    queryKey: preferencesQueryKeys.all,
    queryFn: fetchPreferences,
    select: transformPreferences,
    enabled: !!zonesAndFspMap // Don't fetch until zones/FSPs are loaded
  });
}

/**
 * Generic mutation hook for updating any preference (other than "favorites"
 * and "recently viewed folders") in the backend
 *
 * @example
 * const mutation = useUpdatePreferenceMutation();
 * mutation.mutate({ key: 'hideDotFiles', value: true });
 */
export function useUpdatePreferenceMutation(): UseMutationResult<
  void,
  Error,
  UpdatePreferencePayload,
  { previousData?: PreferencesApiResponse }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async <T>({ key, value }: UpdatePreferencePayload<T>) => {
      const response = await sendFetchRequest(`/api/preference/${key}`, 'PUT', {
        value
      });
      if (!response.ok) {
        throw await toHttpError(response);
      }
      // Don't return the Response object - it can't be cloned by devtools
      return;
    },
    // Optimistic update for immediate UI feedback
    onMutate: async ({ key, value }) => {
      // Skip optimistic updates for layout - it doesn't need immediate cache update
      // since the panels library provides the visual feedback
      if (key === 'layout') {
        return { previousData: undefined };
      }

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: preferencesQueryKeys.all });

      // Get the raw API response data (before transformation)
      const previousData = queryClient.getQueryData<PreferencesApiResponse>(
        preferencesQueryKeys.all
      );

      // Optimistically update the raw API response cache
      // Note: We're updating PreferencesApiResponse (raw), not PreferencesQueryData (transformed)
      queryClient.setQueryData<PreferencesApiResponse>(
        preferencesQueryKeys.all,
        old => {
          if (!old) {
            return old;
          }
          // Update the raw API response format which has { value: T } structure
          return {
            ...old,
            [key]: { value }
          };
        }
      );

      return { previousData };
    },
    // On error, rollback
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          preferencesQueryKeys.all,
          context.previousData
        );
      }
    },
    // Mark as stale but don't force refetch - respect staleTime
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: preferencesQueryKeys.all,
        refetchType: 'none'
      });
    }
  });
}

/**
 * Mutation hook for updating favorites (zone, fileSharePath, or folder)
 *
 * @example
 * const mutation = useUpdateFavoritesMutation();
 * mutation.mutate({ preferenceKey: 'zone', updatedMap: { ... } });
 */
export function useUpdateFavoritesMutation(): UseMutationResult<
  void,
  Error,
  FavoriteUpdatePayload,
  { previousData?: PreferencesApiResponse }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      preferenceKey,
      updatedMap
    }: FavoriteUpdatePayload) => {
      const response = await sendFetchRequest(
        `/api/preference/${preferenceKey}`,
        'PUT',
        { value: Object.values(updatedMap) }
      );
      if (!response.ok) {
        throw await toHttpError(response);
      }
      // Don't return the Response object - it can't be cloned by devtools
      return;
    },
    // Optimistic update for immediate UI feedback
    onMutate: async ({ preferenceKey, updatedMap }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: preferencesQueryKeys.all });

      // Get the raw API response data (before transformation)
      const previousData = queryClient.getQueryData<PreferencesApiResponse>(
        preferencesQueryKeys.all
      );

      // Optimistically update the raw API response cache
      queryClient.setQueryData<PreferencesApiResponse>(
        preferencesQueryKeys.all,
        old => {
          if (!old) {
            return old;
          }
          // Update the appropriate favorites array in raw format
          return {
            ...old,
            [preferenceKey]: { value: Object.values(updatedMap) }
          };
        }
      );

      return { previousData };
    },
    // On error, rollback
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          preferencesQueryKeys.all,
          context.previousData
        );
      }
    },
    // Mark as stale but don't force refetch - respect staleTime
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: preferencesQueryKeys.all,
        refetchType: 'none'
      });
    }
  });
}

/**
 * Mutation hook for updating recently viewed folders with optimistic updates
 *
 * @example
 * const mutation = useUpdateRecentlyViewedFoldersMutation();
 * mutation.mutate(updatedFolders);
 */
export function useUpdateRecentlyViewedFoldersMutation(): UseMutationResult<
  void,
  Error,
  FolderPreference[],
  { previousData?: PreferencesApiResponse }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folders: FolderPreference[]) => {
      const response = await sendFetchRequest(
        '/api/preference/recentlyViewedFolders',
        'PUT',
        { value: folders }
      );
      if (!response.ok) {
        throw await toHttpError(response);
      }
      // Don't return the Response object - it can't be cloned by devtools
      return;
    },
    // Optimistic update for better UX
    onMutate: async (newFolders: FolderPreference[]) => {
      // Cancel any outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: preferencesQueryKeys.all });

      // Get the raw API response data (before transformation)
      const previousData = queryClient.getQueryData<PreferencesApiResponse>(
        preferencesQueryKeys.all
      );

      // Optimistically update the raw API response cache
      queryClient.setQueryData<PreferencesApiResponse>(
        preferencesQueryKeys.all,
        old => {
          if (!old) {
            return old;
          }
          return {
            ...old,
            recentlyViewedFolders: { value: newFolders }
          };
        }
      );

      return { previousData };
    },
    // On error, rollback to the previous value
    onError: (_err, _newFolders, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(
          preferencesQueryKeys.all,
          context.previousData
        );
      }
    },
    // Mark as stale but don't force refetch - respect staleTime
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: preferencesQueryKeys.all,
        refetchType: 'none'
      });
    }
  });
}
