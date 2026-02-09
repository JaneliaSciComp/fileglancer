import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';

import { sendFetchRequest } from '@/utils';
import {
  getResponseJsonOrError,
  throwResponseNotOkError
} from '@/queries/queryUtils';
import type { AppManifest, UserApp } from '@/shared.types';

// --- Query Keys ---

export const appsQueryKeys = {
  all: ['apps'] as const,
  list: () => ['apps', 'list'] as const
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
  string
> {
  return useMutation({
    mutationFn: async (url: string) => {
      const response = await sendFetchRequest('/api/apps/manifest', 'POST', {
        url
      });
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data as AppManifest;
    }
  });
}

export function useAddAppMutation(): UseMutationResult<UserApp, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (url: string) => {
      const response = await sendFetchRequest('/api/apps', 'POST', { url });
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

export async function validatePaths(
  paths: Record<string, string>
): Promise<Record<string, string>> {
  const response = await sendFetchRequest('/api/apps/validate-paths', 'POST', {
    paths
  });
  const data = await getResponseJsonOrError(response);
  if (!response.ok) {
    throwResponseNotOkError(response, data);
  }
  return (data as { errors: Record<string, string> }).errors;
}

export function useRemoveAppMutation(): UseMutationResult<
  unknown,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (url: string) => {
      const encodedUrl = encodeURIComponent(url);
      const response = await sendFetchRequest(
        `/api/apps?url=${encodedUrl}`,
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
