import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';

import { sendFetchRequest } from '@/utils';
import {
  getResponseJsonOrError,
  throwResponseNotOkError
} from '@/queries/queryUtils';
import type {
  AppListing,
  AppManifest,
  DiscoveredApp,
  UserApp
} from '@/shared.types';

// --- Query Keys ---

export const appsQueryKeys = {
  all: ['apps'] as const,
  list: () => ['apps', 'list'] as const
};

export const catalogQueryKeys = {
  all: ['catalog'] as const,
  list: () => ['catalog', 'list'] as const
};

// --- Fetch Helpers ---

async function fetchUserApps(signal?: AbortSignal): Promise<UserApp[]> {
  const response = await sendFetchRequest('/api/apps', 'GET', undefined, {
    signal
  });
  const data = await getResponseJsonOrError(response);
  if (!response.ok) {
    throwResponseNotOkError(response, data);
  }
  return data as UserApp[];
}

// --- Query Hooks ---

export function useAppsQuery(): UseQueryResult<UserApp[], Error> {
  return useQuery({
    queryKey: appsQueryKeys.list(),
    queryFn: ({ signal }) => fetchUserApps(signal),
    staleTime: 5 * 60 * 1000
  });
}

// --- Mutation Hooks ---

export function useManifestPreviewMutation(): UseMutationResult<
  AppManifest,
  Error,
  { url: string; manifest_path: string }
> {
  return useMutation({
    mutationFn: async ({
      url,
      manifest_path
    }: {
      url: string;
      manifest_path: string;
    }) => {
      const response = await sendFetchRequest('/api/apps/manifest', 'POST', {
        url,
        manifest_path
      });
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data as AppManifest;
    }
  });
}

export function useDiscoverAppsMutation(): UseMutationResult<
  DiscoveredApp[],
  Error,
  string
> {
  return useMutation({
    mutationFn: async (url: string) => {
      const response = await sendFetchRequest('/api/apps/discover', 'POST', {
        url
      });
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data as DiscoveredApp[];
    }
  });
}

export function useAddAppMutation(): UseMutationResult<
  UserApp[],
  Error,
  { url: string; manifest_paths?: string[] }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      url,
      manifest_paths
    }: {
      url: string;
      manifest_paths?: string[];
    }) => {
      const response = await sendFetchRequest('/api/apps', 'POST', {
        url,
        // Only include manifest_paths when provided; omitting it adds all apps.
        ...(manifest_paths ? { manifest_paths } : {})
      });
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data as UserApp[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appsQueryKeys.all });
    }
  });
}

export async function validatePaths(
  paths: Record<string, string>,
  createIfMissing: string[] = []
): Promise<Record<string, string>> {
  const response = await sendFetchRequest('/api/apps/validate-paths', 'POST', {
    paths,
    create_if_missing: createIfMissing
  });
  const data = await getResponseJsonOrError(response);
  if (!response.ok) {
    throwResponseNotOkError(response, data);
  }
  return (data as { errors: Record<string, string> }).errors;
}

export function useUpdateAppMutation(): UseMutationResult<
  UserApp,
  Error,
  { url: string; manifest_path: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      url,
      manifest_path
    }: {
      url: string;
      manifest_path: string;
    }) => {
      const response = await sendFetchRequest('/api/apps/update', 'POST', {
        url,
        manifest_path
      });
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data as UserApp;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appsQueryKeys.all });
    }
  });
}

export function useRemoveAppMutation(): UseMutationResult<
  unknown,
  Error,
  { url: string; manifest_path: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      url,
      manifest_path
    }: {
      url: string;
      manifest_path: string;
    }) => {
      const encodedUrl = encodeURIComponent(url);
      const encodedPath = encodeURIComponent(manifest_path);
      const response = await sendFetchRequest(
        `/api/apps?url=${encodedUrl}&manifest_path=${encodedPath}`,
        'DELETE'
      );
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appsQueryKeys.all });
    }
  });
}

// --- Catalog hooks ---

export function useCatalogQuery(): UseQueryResult<AppListing[], Error> {
  return useQuery({
    queryKey: catalogQueryKeys.list(),
    queryFn: async ({ signal }) => {
      const response = await sendFetchRequest(
        '/api/catalog',
        'GET',
        undefined,
        { signal }
      );
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data as AppListing[];
    },
    staleTime: 5 * 60 * 1000
  });
}

export function useShareAppMutation(): UseMutationResult<
  AppListing,
  Error,
  {
    url: string;
    manifest_path: string;
    name?: string;
    description?: string;
  }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async payload => {
      const response = await sendFetchRequest('/api/catalog', 'POST', payload);
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data as AppListing;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: catalogQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: appsQueryKeys.all });
    }
  });
}

export function useUpdateListingMutation(): UseMutationResult<
  AppListing,
  Error,
  { listing_id: number; name?: string; description?: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listing_id, name, description }) => {
      const response = await sendFetchRequest(
        `/api/catalog/${listing_id}`,
        'PATCH',
        { name, description }
      );
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data as AppListing;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: catalogQueryKeys.all });
    }
  });
}

export function useUnshareListingMutation(): UseMutationResult<
  unknown,
  Error,
  { listing_id: number }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listing_id }) => {
      const response = await sendFetchRequest(
        `/api/catalog/${listing_id}`,
        'DELETE'
      );
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: catalogQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: appsQueryKeys.all });
    }
  });
}

export function useAddFromListingMutation(): UseMutationResult<
  UserApp,
  Error,
  { listing_id: number }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listing_id }) => {
      const response = await sendFetchRequest(
        `/api/catalog/${listing_id}/add`,
        'POST',
        {}
      );
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data as UserApp;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: appsQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: catalogQueryKeys.all });
    }
  });
}
