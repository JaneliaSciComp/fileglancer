import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult
} from '@tanstack/react-query';

import { sendFetchRequest, HTTPError } from '@/utils';
import { toHttpError } from '@/utils/errorHandling';

export type NGLink = {
  short_key: string;
  short_name: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
  state_url: string;
  neuroglancer_url: string;
};

type NGLinksResponse = {
  links?: NGLink[];
};

type NGLinkResponse = {
  short_key: string;
  short_name: string | null;
  state_url: string;
  neuroglancer_url: string;
};

type CreateNGLinkPayload = {
  url?: string;
  state?: Record<string, unknown>;
  url_base?: string;
  short_name?: string;
  short_key?: string;
  title?: string;
};

type UpdateNGLinkPayload = {
  short_key: string;
  url: string;
  title?: string;
};

export const ngLinkQueryKeys = {
  all: ['ngLinks'] as const,
  list: () => ['ngLinks', 'list'] as const
};

const fetchNGLinks = async (signal?: AbortSignal): Promise<NGLink[]> => {
  try {
    const response = await sendFetchRequest(
      '/api/neuroglancer/nglinks',
      'GET',
      undefined,
      { signal }
    );
    if (response.status === 404) {
      return [];
    }
    if (!response.ok) {
      throw await toHttpError(response);
    }
    const data = (await response.json()) as NGLinksResponse;
    return data.links ?? [];
  } catch (error) {
    if (error instanceof HTTPError && error.responseCode === 404) {
      return [];
    }
    throw error;
  }
};

export function useNGLinksQuery(): UseQueryResult<NGLink[], Error> {
  return useQuery<NGLink[], Error>({
    queryKey: ngLinkQueryKeys.list(),
    queryFn: ({ signal }) => fetchNGLinks(signal)
  });
}

export function useCreateNGLinkMutation(): UseMutationResult<
  NGLinkResponse,
  Error,
  CreateNGLinkPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateNGLinkPayload) => {
      const response = await sendFetchRequest(
        '/api/neuroglancer/nglinks',
        'POST',
        payload
      );
      if (!response.ok) {
        throw await toHttpError(response);
      }
      return (await response.json()) as NGLinkResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ngLinkQueryKeys.all
      });
    }
  });
}

export function useUpdateNGLinkMutation(): UseMutationResult<
  NGLinkResponse,
  Error,
  UpdateNGLinkPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateNGLinkPayload) => {
      const response = await sendFetchRequest(
        `/api/neuroglancer/nglinks/${encodeURIComponent(payload.short_key)}`,
        'PUT',
        { url: payload.url, title: payload.title }
      );
      if (!response.ok) {
        throw await toHttpError(response);
      }
      return (await response.json()) as NGLinkResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ngLinkQueryKeys.all
      });
    }
  });
}

export function useDeleteNGLinkMutation(): UseMutationResult<
  void,
  Error,
  string
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (shortKey: string) => {
      const response = await sendFetchRequest(
        `/api/neuroglancer/nglinks/${encodeURIComponent(shortKey)}`,
        'DELETE'
      );
      if (!response.ok) {
        throw await toHttpError(response);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ngLinkQueryKeys.all
      });
    }
  });
}
