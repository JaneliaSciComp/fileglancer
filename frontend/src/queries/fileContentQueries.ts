import {
  useQuery,
  UseQueryResult,
  QueryFunctionContext
} from '@tanstack/react-query';

import { buildUrl, sendFetchRequest } from '@/utils';
import { fetchFileContent } from './queryUtils';
import type { FetchRequestOptions } from '@/shared.types';

const BROWSER_RENDERABLE_EXTENSIONS: Record<
  string,
  'image' | 'video' | 'audio' | 'pdf'
> = {
  // Images
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  ico: 'image',
  bmp: 'image',
  // Video
  mp4: 'video',
  webm: 'video',
  ogv: 'video',
  // Audio
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  aac: 'audio',
  flac: 'audio',
  // Documents
  pdf: 'pdf'
};

/**
 * Returns the browser-renderable media type for a filename, or null if the
 * browser cannot render it natively. Used to gate the "View" menu item and
 * (in future) to select the appropriate inline preview renderer.
 */
export function getBrowserRenderableType(
  filename: string
): 'image' | 'video' | 'audio' | 'pdf' | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return BROWSER_RENDERABLE_EXTENSIONS[ext] ?? null;
}

// Query keys for file content and metadata
export const fileContentQueryKeys = {
  detail: (fspName: string, filePath: string) =>
    ['fileContent', fspName, filePath] as const,
  head: (fspName: string, filePath: string) =>
    ['fileContentHead', fspName, filePath] as const
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
