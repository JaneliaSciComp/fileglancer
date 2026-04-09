import {
  useQuery,
  UseQueryResult,
  QueryFunctionContext
} from '@tanstack/react-query';

import { buildUrl, sendFetchRequest } from '@/utils';
import { fetchFileContent } from './queryUtils';
import type { FetchRequestOptions } from '@/shared.types';

// Number of bytes to fetch for binary hex preview
const BINARY_PREVIEW_BYTES = 512;

// Query keys for file content and metadata
export const fileContentQueryKeys = {
  detail: (fspName: string, filePath: string) =>
    ['fileContent', fspName, filePath] as const,
  head: (fspName: string, filePath: string) =>
    ['fileContentHead', fspName, filePath] as const,
  binaryPreview: (fspName: string, filePath: string) =>
    ['fileBinaryPreview', fspName, filePath] as const
};

// Type for HEAD response metadata
export type FileContentMetadata = {
  isBinary: boolean;
  size?: number;
  lastModified?: string;
  contentType?: string;
};

// Fetch file metadata via HEAD request
async function fetchFileMetadata(
  fspName: string,
  path: string,
  options?: FetchRequestOptions
): Promise<FileContentMetadata> {
  const url = buildUrl('/api/content/', fspName, { subpath: path });
  const response = await sendFetchRequest(url, 'HEAD', undefined, options);

  if (!response.ok) {
    throw new Error(`Failed to fetch file metadata: ${response.statusText}`);
  }

  const isBinaryHeader = response.headers.get('X-Is-Binary');
  const isBinary = isBinaryHeader === 'true';

  return {
    isBinary,
    size: response.headers.get('Content-Length')
      ? parseInt(response.headers.get('Content-Length')!)
      : undefined,
    lastModified: response.headers.get('Last-Modified') || undefined,
    contentType: response.headers.get('Content-Type') || undefined
  };
}

// Hook to fetch file metadata (HEAD request)
export function useFileMetadataQuery(
  fspName: string | undefined,
  filePath: string
): UseQueryResult<FileContentMetadata, Error> {
  return useQuery<FileContentMetadata, Error>({
    queryKey: fileContentQueryKeys.head(fspName || '', filePath),
    queryFn: async ({ signal }: QueryFunctionContext) => {
      return fetchFileMetadata(fspName!, filePath, { signal });
    },
    enabled: !!fspName && !!filePath,
    retry: (failureCount, error) => {
      // Do not retry on permission errors
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('permission')
      ) {
        return false;
      }
      return failureCount < 3;
    }
  });
}

// Hook to fetch file content (GET request)
// Now simplified - just fetches and decodes as UTF-8
export function useFileContentQuery(
  fspName: string | undefined,
  filePath: string
): UseQueryResult<string, Error> {
  return useQuery<string, Error>({
    queryKey: fileContentQueryKeys.detail(fspName || '', filePath),
    queryFn: async ({ signal }: QueryFunctionContext) => {
      const rawData = await fetchFileContent(fspName!, filePath, { signal });
      return new TextDecoder('utf-8', { fatal: false }).decode(rawData);
    },
    enabled: !!fspName && !!filePath,
    retry: (failureCount, error) => {
      // Do not retry on permission errors
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('permission')
      ) {
        return false;
      }
      return failureCount < 3; // Default retry behavior
    }
  });
}

/**
 * Fetch the first BINARY_PREVIEW_BYTES bytes of a file using an HTTP Range
 * request. Used to render a hex preview for binary files.
 * Enabled only after HEAD confirms the file is binary.
 */
export function useFileBinaryPreviewQuery(
  fspName: string | undefined,
  filePath: string,
  enabled: boolean = true
): UseQueryResult<Uint8Array, Error> {
  return useQuery<Uint8Array, Error>({
    queryKey: fileContentQueryKeys.binaryPreview(fspName || '', filePath),
    queryFn: async ({ signal }: QueryFunctionContext) => {
      const url = buildUrl('/api/content/', fspName!, { subpath: filePath });
      const response = await sendFetchRequest(url, 'GET', undefined, {
        signal,
        headers: { Range: `bytes=0-${BINARY_PREVIEW_BYTES - 1}` }
      });
      // 206 Partial Content or 200 OK (if server ignores Range) are both fine
      if (!response.ok) {
        throw new Error(
          `Failed to fetch binary preview: ${response.statusText}`
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    enabled: !!fspName && !!filePath && enabled,
    staleTime: 5 * 60 * 1000,
    retry: false
  });
}
