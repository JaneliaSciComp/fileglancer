import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';

import { sendFetchRequest, buildUrl } from '@/utils';
import type { FileSharePath } from '@/shared.types';
import {
  getResponseJsonOrError,
  sendRequestAndThrowForNotOk,
  throwResponseNotOkError
} from './queryUtils';
import { proxiedPathQueryKeys } from './proxiedPathQueries';

export type CloudStorageConfig = {
  enabled: boolean;
  endpoint_url_allowed: boolean;
  allowed_endpoints: string[] | null;
};

export type CreateCloudBucketPayload = {
  protocol: 's3';
  bucket: string;
  prefix?: string;
  endpoint_url?: string;
  label?: string;
};

export type DeleteCloudBucketResponse = {
  name: string;
  removed_links: number;
};

export const cloudStorageQueryKeys = {
  config: ['cloudStorage', 'config'] as const
};

const fetchCloudStorageConfig = async (
  signal?: AbortSignal
): Promise<CloudStorageConfig> => {
  const response = await sendFetchRequest(
    '/api/cloud-storage/config',
    'GET',
    undefined,
    { signal }
  );
  const body = await getResponseJsonOrError(response);
  if (!response.ok) {
    throwResponseNotOkError(response, body);
  }
  return body as CloudStorageConfig;
};

export function useCloudStorageConfigQuery(): UseQueryResult<
  CloudStorageConfig,
  Error
> {
  return useQuery<CloudStorageConfig, Error>({
    queryKey: cloudStorageQueryKeys.config,
    queryFn: ({ signal }) => fetchCloudStorageConfig(signal),
    staleTime: Infinity,
    retry: false
  });
}

export function useCreateCloudBucketMutation(): UseMutationResult<
  FileSharePath,
  Error,
  CreateCloudBucketPayload
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateCloudBucketPayload) =>
      (await sendRequestAndThrowForNotOk(
        '/api/cloud-storage/buckets',
        'POST',
        payload
      )) as FileSharePath,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fileSharePaths'] });
    }
  });
}

export function useDeleteCloudBucketMutation(): UseMutationResult<
  DeleteCloudBucketResponse,
  Error,
  { name: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name }: { name: string }) =>
      (await sendRequestAndThrowForNotOk(
        buildUrl('/api/cloud-storage/buckets/', name, null),
        'DELETE'
      )) as DeleteCloudBucketResponse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fileSharePaths'] });
      queryClient.invalidateQueries({ queryKey: proxiedPathQueryKeys.all });
    }
  });
}
