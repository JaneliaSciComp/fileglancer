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
      `/api/external-buckets/${encodeURIComponent(fspName)}`,
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
 * Transforms an external bucket into a data URL based on the current file path
 *
 * @param bucket - The external bucket configuration or null
 * @param currentFilePath - The current file or folder path
 * @param fspName - The file share path name
 * @returns The external data URL or null if not applicable
 */
export function transformBucketToDataUrl(
  bucket: ExternalBucket | null,
  currentFilePath: string | undefined,
  fspName: string | undefined
): string | null {
  if (!bucket || !currentFilePath || !fspName) {
    return null;
  }

  // Check if current path is within the bucket path and FSP matches
  if (
    fspName === bucket.fsp_name &&
    currentFilePath.startsWith(bucket.relative_path)
  ) {
    // Create data URL with relative path from bucket
    const relativePath = currentFilePath.substring(bucket.relative_path.length);
    const cleanRelativePath = relativePath.startsWith('/')
      ? relativePath.substring(1)
      : relativePath;
    const externalUrl = bucket.external_url.endsWith('/')
      ? bucket.external_url.slice(0, -1)
      : bucket.external_url;
    return `${externalUrl}/${cleanRelativePath}/`;
  }

  return null;
}

/**
 * Query hook for fetching an external bucket and transforming it to a data URL
 *
 * @param fspName - File share path name
 * @param currentFilePath - The current file or folder path
 * @param enabled - Whether the query should run
 * @returns Query result with external data URL or null
 */
export function useExternalDataUrlQuery(
  fspName: string | undefined,
  currentFilePath: string | undefined,
  enabled: boolean = false
): UseQueryResult<string | null, Error> {
  const shouldFetch = enabled && !!fspName;

  return useQuery<ExternalBucket | null, Error, string | null>({
    queryKey: externalBucketQueryKeys.byFsp(fspName ?? ''),
    queryFn: ({ signal }) => fetchExternalBucket(fspName!, signal),
    enabled: shouldFetch,
    staleTime: 5 * 60 * 1000, // 5 minutes - external buckets rarely change
    select: bucket => transformBucketToDataUrl(bucket, currentFilePath, fspName)
  });
}
