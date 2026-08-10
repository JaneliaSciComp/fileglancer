import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult
} from '@tanstack/react-query';

import { sendFetchRequest, buildUrl } from '@/utils';
import {
  getResponseJsonOrError,
  sendRequestAndThrowForNotOk,
  throwResponseNotOkError
} from './queryUtils';

export type ViewLayer = {
  layer_index: number;
  data_link_id: number | null;
  channel: string | null;
  opts: Record<string, unknown> | null;
  broken: boolean;
};

export type View = {
  short_key: string;
  read_key: string;
  name: string;
  ng_state: Record<string, unknown>;
  sharing_mode: 'private' | 'read';
  owner: string;
  created_at: string;
  updated_at: string;
  layers: ViewLayer[];
};

export type ViewLayerInput = {
  sharing_key: string | null;
  layer_index: number;
  channel: string | null;
  opts: Record<string, unknown> | null;
};

export type ViewCreateRequest = {
  name: string;
  ng_state: Record<string, unknown>;
  sharing_mode?: 'private' | 'read';
  layers: ViewLayerInput[];
};

export type ViewUpdateRequest = {
  name?: string;
  ng_state?: Record<string, unknown>;
};

/**
 * Raw API envelope from GET /api/neuroglancer/views
 */
type ViewsResponse = {
  views?: View[];
};

// Query key factory for Views
export const viewQueryKeys = {
  all: ['views'] as const,
  list: () => ['views', 'list'] as const,
  forDataLink: (sharingKey: string) =>
    ['views', 'forDataLink', sharingKey] as const
};

/**
 * Sort Views by date (newest updated first)
 */
function sortViewsByDate(views: View[]): View[] {
  return views.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

/**
 * Fetches all Views for the current user from the backend
 * Returns empty array if no views exist (404)
 */
const fetchViews = async (signal?: AbortSignal): Promise<View[]> => {
  const response = await sendFetchRequest(
    '/api/neuroglancer/views',
    'GET',
    undefined,
    { signal }
  );
  const data = (await getResponseJsonOrError(response)) as ViewsResponse;

  if (response.ok) {
    if (data?.views) {
      return sortViewsByDate(data.views);
    } else {
      return [];
    }
  }

  // Handle error responses
  if (response.status === 404) {
    // Not an error, just no views available
    return [];
  } else {
    throwResponseNotOkError(response, data);
  }
};

/**
 * Fetches the Views (owned by the current user) that depend on a Data Link.
 * Returns [] on 404. Mirrors fetchViews: manual status branch so a 404 is not
 * an error and the {error} envelope is not required.
 */
const fetchViewsForDataLink = async (
  sharingKey: string,
  signal?: AbortSignal
): Promise<View[]> => {
  const url = buildUrl('/api/proxied-path', `${sharingKey}/views`);
  const response = await sendFetchRequest(url, 'GET', undefined, { signal });
  const data = (await getResponseJsonOrError(response)) as ViewsResponse;

  if (response.ok) {
    return data?.views ?? [];
  }
  if (response.status === 404) {
    return [];
  }
  throwResponseNotOkError(response, data);
};

/**
 * Query hook for fetching all Views belonging to the current user
 *
 * @returns Query result with all Views
 */
export function useViewsQuery(): UseQueryResult<View[], Error> {
  return useQuery<View[], Error>({
    queryKey: viewQueryKeys.list(),
    queryFn: ({ signal }) => fetchViews(signal)
  });
}

/**
 * Query hook for the Views that depend on a given Data Link (by sharing key).
 * Disabled until a sharing key is provided.
 */
export function useViewsForDataLinkQuery(
  sharingKey?: string
): UseQueryResult<View[], Error> {
  return useQuery<View[], Error>({
    queryKey: viewQueryKeys.forDataLink(sharingKey ?? ''),
    queryFn: ({ signal }) => fetchViewsForDataLink(sharingKey!, signal),
    enabled: !!sharingKey
  });
}

/**
 * Mutation hook for creating a View
 *
 * @returns Mutation result
 * @example
 * const mutation = useCreateViewMutation();
 * mutation.mutate({ name: 'my-view', ng_state: {...}, layers: [] });
 */
export function useCreateViewMutation(): UseMutationResult<
  View,
  Error,
  ViewCreateRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ViewCreateRequest) => {
      const view = await sendRequestAndThrowForNotOk(
        '/api/neuroglancer/views',
        'POST',
        payload
      );
      return view as View;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: viewQueryKeys.all
      });
    }
  });
}

/**
 * Mutation hook for updating a View
 *
 * @returns Mutation result
 * @example
 * const mutation = useUpdateViewMutation();
 * mutation.mutate({ short_key: 'abc123', name: 'New Name' });
 */
export function useUpdateViewMutation(): UseMutationResult<
  View,
  Error,
  { short_key: string } & ViewUpdateRequest
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      short_key,
      ...body
    }: { short_key: string } & ViewUpdateRequest) => {
      const url = buildUrl('/api/neuroglancer/views/', short_key, null);
      const view = await sendRequestAndThrowForNotOk(url, 'PUT', body);
      return view as View;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: viewQueryKeys.all
      });
    }
  });
}

/**
 * Mutation hook for deleting a View
 *
 * @returns Mutation result
 * @example
 * const mutation = useDeleteViewMutation();
 * mutation.mutate('abc123');
 */
export function useDeleteViewMutation(): UseMutationResult<
  void,
  Error,
  string
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shortKey: string) => {
      const url = buildUrl('/api/neuroglancer/views/', shortKey, null);
      await sendRequestAndThrowForNotOk(url, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: viewQueryKeys.all
      });
    }
  });
}
