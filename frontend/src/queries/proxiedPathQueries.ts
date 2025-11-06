import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult
} from '@tanstack/react-query';

import { sendFetchRequest, HTTPError } from '@/utils';
import { toHttpError } from '@/utils/errorHandling';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';

/**
 * Raw API response structure from /api/proxied-path endpoints
 */
type ProxiedPathApiResponse = {
  paths?: ProxiedPath[];
};

/**
 * Payload for creating a proxied path
 */
type CreateProxiedPathPayload = {
  fsp_name: string;
  path: string;
};

/**
 * Payload for deleting a proxied path
 */
type DeleteProxiedPathPayload = {
  sharing_key: string;
};

// Query key factory for proxied paths
export const proxiedPathQueryKeys = {
  all: ['proxiedPaths'] as const,
  list: () => ['proxiedPaths', 'list'] as const,
  detail: (fspName: string, path: string) =>
    ['proxiedPaths', 'detail', fspName, path] as const
};

/**
 * Sort proxied paths by date (newest first)
 */
function sortProxiedPathsByDate(paths: ProxiedPath[]): ProxiedPath[] {
  return paths.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Fetches all proxied paths from the backend
 * Returns empty array if no paths exist (404)
 */
const fetchAllProxiedPaths = async (
  signal?: AbortSignal
): Promise<ProxiedPath[]> => {
  try {
    const response = await sendFetchRequest(
      '/api/proxied-path',
      'GET',
      undefined,
      { signal }
    );
    if (response.status === 404) {
      // Not an error, just no proxied paths available
      return [];
    }
    if (!response.ok) {
      throw await toHttpError(response);
    }
    const data = (await response.json()) as ProxiedPathApiResponse;
    if (data?.paths) {
      return sortProxiedPathsByDate(data.paths);
    }
    return [];
  } catch (error) {
    if (error instanceof HTTPError && error.responseCode === 404) {
      return []; // No proxied paths found
    }
    throw error;
  }
};

/**
 * Fetches a single proxied path by FSP name and path
 * Returns null if no proxied path exists (404)
 */
const fetchProxiedPathByFspAndPath = async (
  fspName: string,
  path: string,
  signal?: AbortSignal
): Promise<ProxiedPath | null> => {
  try {
    const response = await sendFetchRequest(
      `/api/proxied-path?fsp_name=${fspName}&path=${path}`,
      'GET',
      undefined,
      { signal }
    );

    if (response.status === 404) {
      // Not an error, just no proxied path found for this fsp/path
      return null;
    }

    if (!response.ok) {
      throw await toHttpError(response);
    }

    const data = (await response.json()) as ProxiedPathApiResponse;
    if (data?.paths && data.paths.length > 0) {
      return data.paths[0];
    }
    return null;
  } catch (error) {
    if (error instanceof HTTPError && error.responseCode === 404) {
      return null; // No proxied path found
    }
    throw error;
  }
};

/**
 * Query hook for fetching all proxied paths
 *
 * @returns Query result with all proxied paths
 */
export function useAllProxiedPathsQuery(): UseQueryResult<
  ProxiedPath[],
  Error
> {
  return useQuery<ProxiedPath[], Error>({
    queryKey: proxiedPathQueryKeys.list(),
    queryFn: ({ signal }) => fetchAllProxiedPaths(signal)
  });
}

/**
 * Query hook for fetching a proxied path by FSP name and path
 *
 * @param fspName - File share path name
 * @param path - File/folder path
 * @param enabled - Whether the query should run
 * @returns Query result with single proxied path or null
 */
export function useProxiedPathByFspAndPathQuery(
  fspName: string | undefined,
  path: string | undefined
): UseQueryResult<ProxiedPath | null, Error> {
  return useQuery<ProxiedPath | null, Error>({
    queryKey: proxiedPathQueryKeys.detail(fspName ?? '', path ?? ''),
    queryFn: ({ signal }) =>
      fetchProxiedPathByFspAndPath(fspName!, path!, signal),
    enabled: !!fspName && !!path
  });
}

/**
 * Mutation hook for creating a new proxied path
 *
 * @example
 * const mutation = useCreateProxiedPathMutation();
 * mutation.mutate({ fsp_name: 'my-fsp', path: '/data/file.zarr' });
 */
export function useCreateProxiedPathMutation(): UseMutationResult<
  ProxiedPath,
  Error,
  CreateProxiedPathPayload,
  { previousPaths?: ProxiedPath[] }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateProxiedPathPayload) => {
      const response = await sendFetchRequest(
        `/api/proxied-path?fsp_name=${encodeURIComponent(payload.fsp_name)}&path=${encodeURIComponent(payload.path)}`,
        'POST'
      );
      if (!response.ok) {
        throw await toHttpError(response);
      }
      const proxiedPath = (await response.json()) as ProxiedPath;
      return proxiedPath;
    },
    // Optimistic update for all proxied paths list
    onMutate: async (newPath: CreateProxiedPathPayload) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: proxiedPathQueryKeys.all });

      // Get previous proxied paths
      const previousPaths = queryClient.getQueryData<ProxiedPath[]>(
        proxiedPathQueryKeys.list()
      );

      return { previousPaths };
    },
    // On success, update both the list and the specific proxied path detail
    onSuccess: (newProxiedPath: ProxiedPath) => {
      // Update the detail query for this specific proxied path
      queryClient.setQueryData(
        proxiedPathQueryKeys.detail(
          newProxiedPath.fsp_name,
          newProxiedPath.path
        ),
        newProxiedPath
      );

      // Invalidate and refetch the list
      queryClient.invalidateQueries({
        queryKey: proxiedPathQueryKeys.all
      });
    },
    // On error, rollback
    onError: (_err, _variables, context) => {
      if (context?.previousPaths) {
        queryClient.setQueryData(
          proxiedPathQueryKeys.list(),
          context.previousPaths
        );
      }
    }
  });
}

/**
 * Mutation hook for deleting a proxied path
 *
 * @example
 * const mutation = useDeleteProxiedPathMutation();
 * mutation.mutate({ sharing_key: 'abc123' });
 */
export function useDeleteProxiedPathMutation(): UseMutationResult<
  void,
  Error,
  DeleteProxiedPathPayload,
  { previousPaths?: ProxiedPath[] }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: DeleteProxiedPathPayload) => {
      const response = await sendFetchRequest(
        `/api/proxied-path/${payload.sharing_key}`,
        'DELETE'
      );
      if (!response.ok) {
        throw await toHttpError(response);
      }
    },
    // Optimistic update
    onMutate: async (deletedPath: DeleteProxiedPathPayload) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: proxiedPathQueryKeys.all });

      // Get previous proxied paths
      const previousPaths = queryClient.getQueryData<ProxiedPath[]>(
        proxiedPathQueryKeys.list()
      );

      // Optimistically remove the deleted path from the list
      if (previousPaths) {
        const updatedPaths = previousPaths.filter(
          path => path.sharing_key !== deletedPath.sharing_key
        );
        queryClient.setQueryData(proxiedPathQueryKeys.list(), updatedPaths);
      }

      return { previousPaths };
    },
    // On success, invalidate all queries to ensure consistency
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: proxiedPathQueryKeys.all
      });
    },
    // On error, rollback
    onError: (_err, _variables, context) => {
      if (context?.previousPaths) {
        queryClient.setQueryData(
          proxiedPathQueryKeys.list(),
          context.previousPaths
        );
      }
    }
  });
}
