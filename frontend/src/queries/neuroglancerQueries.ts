import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult
} from '@tanstack/react-query';

import { sendFetchRequest, HTTPError } from '@/utils';
import { toHttpError } from '@/utils/errorHandling';

export type NeuroglancerShortLink = {
  short_key: string;
  short_name: string | null;
  created_at: string;
  updated_at: string;
  state_url: string;
  neuroglancer_url: string;
};

type NeuroglancerShortLinksResponse = {
  links?: NeuroglancerShortLink[];
};

type NeuroglancerShortenResponse = {
  short_key: string;
  short_name: string | null;
  state_url: string;
  neuroglancer_url: string;
};

type CreateShortLinkPayload = {
  url?: string;
  state?: Record<string, unknown>;
  url_base?: string;
  short_name?: string;
  short_key?: string;
};

export const neuroglancerQueryKeys = {
  all: ['neuroglancerLinks'] as const,
  list: () => ['neuroglancerLinks', 'list'] as const
};

const fetchNeuroglancerShortLinks = async (
  signal?: AbortSignal
): Promise<NeuroglancerShortLink[]> => {
  try {
    const response = await sendFetchRequest(
      '/api/neuroglancer/short-links',
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
    const data = (await response.json()) as NeuroglancerShortLinksResponse;
    return data.links ?? [];
  } catch (error) {
    if (error instanceof HTTPError && error.responseCode === 404) {
      return [];
    }
    throw error;
  }
};

export function useNeuroglancerShortLinksQuery(): UseQueryResult<
  NeuroglancerShortLink[],
  Error
> {
  return useQuery<NeuroglancerShortLink[], Error>({
    queryKey: neuroglancerQueryKeys.list(),
    queryFn: ({ signal }) => fetchNeuroglancerShortLinks(signal)
  });
}

export function useCreateNeuroglancerShortLinkMutation(): UseMutationResult<
  NeuroglancerShortenResponse,
  Error,
  CreateShortLinkPayload
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateShortLinkPayload) => {
      const response = await sendFetchRequest(
        '/api/neuroglancer/shorten',
        'POST',
        payload
      );
      if (!response.ok) {
        throw await toHttpError(response);
      }
      return (await response.json()) as NeuroglancerShortenResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: neuroglancerQueryKeys.all
      });
    }
  });
}
