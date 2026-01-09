import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult
} from '@tanstack/react-query';

import { sendFetchRequest, buildUrl } from '@/utils';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import {
  getResponseJsonOrError,
  sendRequestAndThrowForNotOk,
  throwResponseNotOkError
} from './queryUtils';

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
  // Don't use sendRequestAndThrowForNotOk here because we want to handle 404 differently
  const response = await sendFetchRequest(
    '/api/proxied-path',
    'GET',
    undefined,
    { signal }
  );
  const data = (await getResponseJsonOrError(
    response
  )) as ProxiedPathApiResponse;

  if (response.ok) {
    if (data?.paths) {
      return sortProxiedPathsByDate(data.paths);
    } else {
      return [];
    }
  }

  // Handle error responses
  if (response.status === 404) {
    // Not an error, just no proxied paths available
    return [];
  } else {
    throwResponseNotOkError(response, data);
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
  const url = buildUrl('/api/proxied-path', null, {
    fsp_name: fspName,
    path
  });
  // Don't use sendRequestAndThrowForNotOk here because we want to handle 404 differently
  const response = await sendFetchRequest(url, 'GET', undefined, { signal });
  const data = (await getResponseJsonOrError(
    response
  )) as ProxiedPathApiResponse;

  if (response.ok) {
    if (data?.paths && data.paths.length > 0) {
      return data.paths[0];
    } else {
      return null;
    }
  }

  // Handle error responses
  if (response.status === 404) {
    // Not an error, just no proxied path found for this fsp/path
    return null;
  } else {
    throwResponseNotOkError(response, data);
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
  path: string | undefined,
  shouldFetch: boolean
): UseQueryResult<ProxiedPath | null, Error> {
  return useQuery<ProxiedPath | null, Error>({
    queryKey: proxiedPathQueryKeys.detail(fspName ?? '', path ?? ''),
    queryFn: ({ signal }) =>
      fetchProxiedPathByFspAndPath(fspName!, path!, signal),
    enabled: !!fspName && shouldFetch
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
      const url = buildUrl('/api/proxied-path', null, {
        fsp_name: payload.fsp_name,
        path: payload.path
      });
      const proxiedPath = await sendRequestAndThrowForNotOk(url, 'POST');
      return proxiedPath as ProxiedPath;
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
      const url = buildUrl('/api/proxied-path/', payload.sharing_key, null);
      await sendRequestAndThrowForNotOk(url, 'DELETE');
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
