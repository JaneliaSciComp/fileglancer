import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult
} from '@tanstack/react-query';

import { sendFetchRequest, buildUrl, HTTPError } from '@/utils';
import { toHttpError } from '@/utils/errorHandling';

/**
 * Neuroglancer link data structure
 */
export interface NeuroglancerLink {
  short_key: string;
  username: string;
  title: string | null;
  ng_url_base: string;
  state_json: string;
  created_at: string;
  updated_at: string;
  short_url: string | null;
}

/**
 * API response structure from /api/ng-link endpoints
 */
interface NeuroglancerLinkApiResponse {
  links?: NeuroglancerLink[];
}

/**
 * Payload for creating a Neuroglancer link
 */
export type CreateNgLinkPayload = {
  ng_url?: string;
  state_json?: string;
  ng_url_base?: string;
  title?: string;
};

/**
 * Payload for updating a Neuroglancer link
 */
export type UpdateNgLinkPayload = {
  short_key: string;
  title?: string | null;
  state_json?: string;
};

/**
 * Payload for deleting a Neuroglancer link
 */
interface DeleteNgLinkPayload {
  short_key: string;
}

// Query key factory for Neuroglancer links
export const ngLinkQueryKeys = {
  all: ['ngLinks'] as const,
  list: () => ['ngLinks', 'list'] as const,
  detail: (shortKey: string) => ['ngLinks', 'detail', shortKey] as const
};

/**
 * Sort links by date (newest first)
 */
function sortLinksByDate(links: NeuroglancerLink[]): NeuroglancerLink[] {
  return links.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Fetches all Neuroglancer links for the current user
 */
const fetchAllNgLinks = async (
  signal?: AbortSignal
): Promise<NeuroglancerLink[]> => {
  try {
    const response = await sendFetchRequest('/api/ng-link', 'GET', undefined, {
      signal
    });
    if (response.status === 404) {
      return [];
    }
    if (!response.ok) {
      throw await toHttpError(response);
    }
    const data = (await response.json()) as NeuroglancerLinkApiResponse;
    if (data?.links) {
      return sortLinksByDate(data.links);
    }
    return [];
  } catch (error) {
    if (error instanceof HTTPError && error.responseCode === 404) {
      return [];
    }
    throw error;
  }
};

/**
 * Fetches a single Neuroglancer link by short key
 */
const fetchNgLinkByKey = async (
  shortKey: string,
  signal?: AbortSignal
): Promise<NeuroglancerLink | null> => {
  try {
    const url = buildUrl('/api/ng-link/', shortKey, null);
    const response = await sendFetchRequest(url, 'GET', undefined, { signal });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw await toHttpError(response);
    }

    return (await response.json()) as NeuroglancerLink;
  } catch (error) {
    if (error instanceof HTTPError && error.responseCode === 404) {
      return null;
    }
    throw error;
  }
};

/**
 * Query hook for fetching all Neuroglancer links
 */
export function useNgLinksQuery(): UseQueryResult<NeuroglancerLink[], Error> {
  return useQuery<NeuroglancerLink[], Error>({
    queryKey: ngLinkQueryKeys.list(),
    queryFn: ({ signal }) => fetchAllNgLinks(signal)
  });
}

/**
 * Query hook for fetching a single Neuroglancer link by short key
 */
export function useNgLinkQuery(
  shortKey: string | undefined,
  enabled: boolean = true
): UseQueryResult<NeuroglancerLink | null, Error> {
  return useQuery<NeuroglancerLink | null, Error>({
    queryKey: ngLinkQueryKeys.detail(shortKey ?? ''),
    queryFn: ({ signal }) => fetchNgLinkByKey(shortKey!, signal),
    enabled: !!shortKey && enabled
  });
}

/**
 * Mutation hook for creating a new Neuroglancer link
 */
export function useCreateNgLinkMutation(): UseMutationResult<
  NeuroglancerLink,
  Error,
  CreateNgLinkPayload,
  { previousLinks?: NeuroglancerLink[] }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateNgLinkPayload) => {
      const response = await sendFetchRequest(
        '/api/ng-link',
        'POST',
        payload as Record<string, unknown>
      );
      if (!response.ok) {
        throw await toHttpError(response);
      }
      return (await response.json()) as NeuroglancerLink;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ngLinkQueryKeys.all });
      const previousLinks = queryClient.getQueryData<NeuroglancerLink[]>(
        ngLinkQueryKeys.list()
      );
      return { previousLinks };
    },
    onSuccess: (newLink: NeuroglancerLink) => {
      queryClient.setQueryData(
        ngLinkQueryKeys.detail(newLink.short_key),
        newLink
      );
      queryClient.invalidateQueries({
        queryKey: ngLinkQueryKeys.all
      });
    },
    onError: (_err, _variables, context) => {
      if (context?.previousLinks) {
        queryClient.setQueryData(ngLinkQueryKeys.list(), context.previousLinks);
      }
    }
  });
}

/**
 * Mutation hook for updating a Neuroglancer link
 */
export function useUpdateNgLinkMutation(): UseMutationResult<
  NeuroglancerLink,
  Error,
  UpdateNgLinkPayload,
  { previousLinks?: NeuroglancerLink[] }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateNgLinkPayload) => {
      const url = buildUrl('/api/ng-link/', payload.short_key, null);
      const body: { title?: string | null; state_json?: string } = {};
      if (payload.title !== undefined) {
        body.title = payload.title;
      }
      if (payload.state_json !== undefined) {
        body.state_json = payload.state_json;
      }
      const response = await sendFetchRequest(url, 'PUT', body);
      if (!response.ok) {
        throw await toHttpError(response);
      }
      return (await response.json()) as NeuroglancerLink;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ngLinkQueryKeys.all });
      const previousLinks = queryClient.getQueryData<NeuroglancerLink[]>(
        ngLinkQueryKeys.list()
      );
      return { previousLinks };
    },
    onSuccess: (updatedLink: NeuroglancerLink) => {
      queryClient.setQueryData(
        ngLinkQueryKeys.detail(updatedLink.short_key),
        updatedLink
      );
      queryClient.invalidateQueries({
        queryKey: ngLinkQueryKeys.all
      });
    },
    onError: (_err, _variables, context) => {
      if (context?.previousLinks) {
        queryClient.setQueryData(ngLinkQueryKeys.list(), context.previousLinks);
      }
    }
  });
}

/**
 * Mutation hook for deleting a Neuroglancer link
 */
export function useDeleteNgLinkMutation(): UseMutationResult<
  void,
  Error,
  DeleteNgLinkPayload,
  { previousLinks?: NeuroglancerLink[] }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: DeleteNgLinkPayload) => {
      const url = buildUrl('/api/ng-link/', payload.short_key, null);
      const response = await sendFetchRequest(url, 'DELETE');
      if (!response.ok) {
        throw await toHttpError(response);
      }
    },
    onMutate: async (deletedLink: DeleteNgLinkPayload) => {
      await queryClient.cancelQueries({ queryKey: ngLinkQueryKeys.all });
      const previousLinks = queryClient.getQueryData<NeuroglancerLink[]>(
        ngLinkQueryKeys.list()
      );
      if (previousLinks) {
        const updatedLinks = previousLinks.filter(
          link => link.short_key !== deletedLink.short_key
        );
        queryClient.setQueryData(ngLinkQueryKeys.list(), updatedLinks);
      }
      return { previousLinks };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ngLinkQueryKeys.all
      });
    },
    onError: (_err, _variables, context) => {
      if (context?.previousLinks) {
        queryClient.setQueryData(ngLinkQueryKeys.list(), context.previousLinks);
      }
    }
  });
}
