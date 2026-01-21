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

export type NGLink = {
  short_key: string;
  short_name: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
  state_url: string;
  neuroglancer_url: string;
};

/**
 * Raw API response structure from /api/neuroglancer/nglinks endpoints
 */
type NGLinksResponse = {
  links?: NGLink[];
};

type NGLinkResponse = {
  short_key: string;
  short_name: string | null;
  state_url: string;
  neuroglancer_url: string;
};

/**
 * Payload for creating a Neuroglancer link
 */
type CreateNGLinkPayload = {
  url?: string;
  state?: Record<string, unknown>;
  url_base?: string;
  short_name?: string;
  short_key?: string;
  title?: string;
};

/**
 * Payload for updating a Neuroglancer link
 */
type UpdateNGLinkPayload = {
  short_key: string;
  url: string;
  title?: string;
};

// Query key factory for Neuroglancer links
export const ngLinkQueryKeys = {
  all: ['ngLinks'] as const,
  list: () => ['ngLinks', 'list'] as const
};

/**
 * Sort Neuroglancer links by date (newest first)
 */
function sortNGLinksByDate(links: NGLink[]): NGLink[] {
  return links.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Fetches all Neuroglancer links from the backend
 * Returns empty array if no links exist (404)
 */
const fetchNGLinks = async (signal?: AbortSignal): Promise<NGLink[]> => {
  const response = await sendFetchRequest(
    '/api/neuroglancer/nglinks',
    'GET',
    undefined,
    { signal }
  );
  const data = (await getResponseJsonOrError(response)) as NGLinksResponse;

  if (response.ok) {
    if (data?.links) {
      return sortNGLinksByDate(data.links);
    } else {
      return [];
    }
  }

  // Handle error responses
  if (response.status === 404) {
    // Not an error, just no links available
    return [];
  } else {
    throwResponseNotOkError(response, data);
  }
};

/**
 * Query hook for fetching all Neuroglancer links
 *
 * @returns Query result with all Neuroglancer links
 */
export function useNGLinksQuery(): UseQueryResult<NGLink[], Error> {
  return useQuery<NGLink[], Error>({
    queryKey: ngLinkQueryKeys.list(),
    queryFn: ({ signal }) => fetchNGLinks(signal)
  });
}

/**
 * Mutation hook for creating a Neuroglancer link
 *
 * @returns Mutation result
 * @example
 * const mutation = useCreateNGLinkMutation();
 * mutation.mutate({ url: 'https://neuroglancer-demo.appspot.com/#!{...}', short_name: 'my-link' });
 */
export function useCreateNGLinkMutation(): UseMutationResult<
  NGLinkResponse,
  Error,
  CreateNGLinkPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateNGLinkPayload) => {
      const ngLink = await sendRequestAndThrowForNotOk(
        '/api/neuroglancer/nglinks',
        'POST',
        payload
      );
      return ngLink as NGLinkResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ngLinkQueryKeys.all
      });
    }
  });
}

/**
 * Mutation hook for updating a Neuroglancer link
 *
 * @returns Mutation result
 * @example
 * const mutation = useUpdateNGLinkMutation();
 * mutation.mutate({ short_key: 'abc123', url: 'https://...', title: 'New Title' });
 */
export function useUpdateNGLinkMutation(): UseMutationResult<
  NGLinkResponse,
  Error,
  UpdateNGLinkPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateNGLinkPayload) => {
      const url = buildUrl(
        '/api/neuroglancer/nglinks/',
        payload.short_key,
        null
      );
      const ngLink = await sendRequestAndThrowForNotOk(url, 'PUT', {
        url: payload.url,
        title: payload.title
      });
      return ngLink as NGLinkResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ngLinkQueryKeys.all
      });
    }
  });
}

/**
 * Mutation hook for deleting a Neuroglancer link
 *
 * @returns Mutation result
 * @example
 * const mutation = useDeleteNGLinkMutation();
 * mutation.mutate('abc123');
 */
export function useDeleteNGLinkMutation(): UseMutationResult<
  void,
  Error,
  string
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shortKey: string) => {
      const url = buildUrl('/api/neuroglancer/nglinks/', shortKey, null);
      await sendRequestAndThrowForNotOk(url, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ngLinkQueryKeys.all
      });
    }
  });
}
