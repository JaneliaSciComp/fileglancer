import { useQuery, UseQueryResult } from '@tanstack/react-query';

import { sendFetchRequest, HTTPError } from '@/utils';
import { toHttpError } from '@/utils/errorHandling';
import { default as log } from '@/logger';

export type ExternalBucket = {
  full_path: string;
  external_url: string;
  fsp_name: string;
  relative_path: string;
};

/**
 * API response structure from /api/external-buckets endpoint
 */
type ExternalBucketsApiResponse = {
  buckets?: ExternalBucket[];
};

export const externalBucketQueryKeys = {
  all: ['externalBuckets'] as const,
  byFsp: (fspName: string) => ['externalBuckets', fspName] as const
};

/**
 * Fetches an external bucket by FSP name
 * Returns null if no external bucket exists (404)
 */
const fetchExternalBucket = async (
  fspName: string,
  signal?: AbortSignal
): Promise<ExternalBucket | null> => {
  try {
    const response = await sendFetchRequest(
      `/api/external-buckets/${fspName}`,
      'GET',
      undefined,
      { signal }
    );

    if (response.status === 404) {
      log.debug('No external bucket found for FSP');
      return null;
    }

    if (!response.ok) {
      throw await toHttpError(response);
    }

    const data = (await response.json()) as ExternalBucketsApiResponse;
    if (data?.buckets && data.buckets.length > 0) {
      return data.buckets[0];
    }

    log.debug('No buckets found in response');
    return null;
  } catch (error) {
    if (error instanceof HTTPError && error.responseCode === 404) {
      return null; // No external bucket found
    }
    log.error('Error fetching external bucket:', error);
    throw error;
  }
};

/**
 * Query hook for fetching an external bucket by FSP name
 *
 * @param fspName - File share path name
 * @param enabled - Whether the query should run
 * @returns Query result with external bucket or null
 */
export function useExternalBucketQuery(
  fspName: string | undefined,
  enabled: boolean = false
): UseQueryResult<ExternalBucket | null, Error> {
  const shouldFetch = enabled && !!fspName;

  return useQuery<ExternalBucket | null, Error>({
    queryKey: externalBucketQueryKeys.byFsp(fspName ?? ''),
    queryFn: ({ signal }) => fetchExternalBucket(fspName!, signal),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000 // 5 minutes - external buckets rarely change
  });
}
