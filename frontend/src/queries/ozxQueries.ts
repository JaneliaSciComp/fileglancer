/**
 * OZX (Zipped OME-Zarr) query hooks and store implementation.
 *
 * RFC-9 Spec: https://ngff.openmicroscopy.org/rfc/9/index.html
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type {
  UseQueryResult,
  UseInfiniteQueryResult,
  InfiniteData
} from '@tanstack/react-query';
import { default as log } from '@/logger';
import { buildUrl, sendFetchRequest } from '@/utils';
import { sendRequestAndThrowForNotOk } from './queryUtils';

/**
 * Metadata response from the OZX metadata endpoint.
 */
export type OzxMetadataResponse = {
  version: string | null;
  json_first: boolean;
  file_count: number;
  is_zip64: boolean;
};

/**
 * A file entry within a ZIP archive with full details.
 */
export type ZipFileEntry = {
  filename: string;
  compressed_size: number;
  uncompressed_size: number;
  compression_method: number;
  is_directory: boolean;
};

/**
 * Paginated response for file entries from a ZIP archive.
 */
export type ZipFileEntriesPage = {
  entries: ZipFileEntry[];
  total_count: number;
  offset: number;
  limit: number;
  has_more: boolean;
};

/**
 * Build URL for accessing content within a ZIP file.
 *
 * @param fspName - The file share path name
 * @param zipFilePath - Path to the ZIP file within the FSP
 * @param internalPath - Path within the ZIP archive
 * @returns Properly encoded URL for the ZIP content endpoint
 */
export function buildZipContentUrl(
  fspName: string,
  zipFilePath: string,
  internalPath: string
): string {
  // Build the path segment: fspName/zipFilePath
  const pathSegment = `${fspName}/${zipFilePath}`;
  return buildUrl('/api/zip-content/', pathSegment, { subpath: internalPath });
}

/**
 * Build full URL for accessing content within a ZIP file.
 * Returns absolute URL suitable for external use (e.g., zarrita stores).
 *
 * @param fspName - The file share path name
 * @param zipFilePath - Path to the ZIP file within the FSP
 * @param internalPath - Path within the ZIP archive
 * @returns Absolute URL
 */
export function getZipContentUrl(
  fspName: string,
  zipFilePath: string,
  internalPath: string
): string {
  const relativePath = buildZipContentUrl(fspName, zipFilePath, internalPath);
  return new URL(relativePath, window.location.origin).href;
}

/**
 * Build URL for the OZX metadata endpoint.
 */
export function buildOzxMetadataUrl(
  fspName: string,
  ozxFilePath: string
): string {
  const pathSegment = `${fspName}/${ozxFilePath}`;
  return buildUrl('/api/ozx-metadata/', pathSegment, null);
}

/**
 * Build URL for listing files in a ZIP archive.
 *
 * @param fspName - The file share path name
 * @param zipFilePath - Path to the ZIP file within the FSP
 * @param prefix - Optional prefix to filter files
 * @param details - If true, include full file entry details
 * @param offset - Number of entries to skip (for pagination)
 * @param limit - Maximum entries to return (for pagination)
 */
export function buildZipListUrl(
  fspName: string,
  zipFilePath: string,
  prefix?: string,
  details?: boolean,
  offset?: number,
  limit?: number
): string {
  const pathSegment = `${fspName}/${zipFilePath}`;
  const params: Record<string, string> = {};
  if (prefix) {
    params.prefix = prefix;
  }
  if (details) {
    params.details = 'true';
  }
  if (offset !== undefined) {
    params.offset = String(offset);
  }
  if (limit !== undefined) {
    params.limit = String(limit);
  }
  return buildUrl(
    '/api/zip-list/',
    pathSegment,
    Object.keys(params).length > 0 ? params : null
  );
}

/**
 * Fetch OZX metadata from the backend.
 */
async function fetchOzxMetadata(
  fspName: string,
  ozxFilePath: string
): Promise<OzxMetadataResponse> {
  const url = buildOzxMetadataUrl(fspName, ozxFilePath);
  const response = (await sendRequestAndThrowForNotOk(
    url,
    'GET'
  )) as OzxMetadataResponse;
  return response;
}

/**
 * Hook to fetch OZX archive metadata.
 *
 * @param fspName - The file share path name
 * @param ozxFilePath - Path to the OZX file within the FSP
 * @param enabled - Whether the query should be enabled
 */
export function useOzxMetadataQuery(
  fspName: string | undefined,
  ozxFilePath: string | undefined,
  enabled: boolean = true
): UseQueryResult<OzxMetadataResponse, Error> {
  return useQuery({
    queryKey: ['ozx', 'metadata', fspName || '', ozxFilePath || ''],
    queryFn: async () => {
      if (!fspName || !ozxFilePath) {
        throw new Error('fspName and ozxFilePath are required');
      }
      return await fetchOzxMetadata(fspName, ozxFilePath);
    },
    enabled: enabled && !!fspName && !!ozxFilePath,
    staleTime: 5 * 60 * 1000 // 5 minutes - OZX metadata doesn't change often
  });
}

/**
 * Fetch list of files in a ZIP archive.
 */
async function fetchZipFileList(
  fspName: string,
  zipFilePath: string,
  prefix?: string
): Promise<string[]> {
  const url = buildZipListUrl(fspName, zipFilePath, prefix);
  const response = (await sendRequestAndThrowForNotOk(url, 'GET')) as {
    files: string[];
  };
  return response.files;
}

/**
 * Fetch detailed file entries from a ZIP archive.
 */
async function fetchZipFileEntries(
  fspName: string,
  zipFilePath: string,
  prefix?: string
): Promise<ZipFileEntry[]> {
  const url = buildZipListUrl(fspName, zipFilePath, prefix, true);
  const response = (await sendRequestAndThrowForNotOk(url, 'GET')) as {
    entries: ZipFileEntry[];
  };
  return response.entries;
}

/**
 * Hook to fetch list of files in a ZIP archive.
 *
 * @param fspName - The file share path name
 * @param zipFilePath - Path to the ZIP file within the FSP
 * @param prefix - Optional prefix to filter files
 * @param enabled - Whether the query should be enabled
 */
export function useZipFileListQuery(
  fspName: string | undefined,
  zipFilePath: string | undefined,
  prefix?: string,
  enabled: boolean = true
): UseQueryResult<string[], Error> {
  return useQuery({
    queryKey: ['zip', 'files', fspName || '', zipFilePath || '', prefix || ''],
    queryFn: async () => {
      if (!fspName || !zipFilePath) {
        throw new Error('fspName and zipFilePath are required');
      }
      return await fetchZipFileList(fspName, zipFilePath, prefix);
    },
    enabled: enabled && !!fspName && !!zipFilePath,
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Hook to fetch detailed file entries from a ZIP archive.
 *
 * @param fspName - The file share path name
 * @param zipFilePath - Path to the ZIP file within the FSP
 * @param prefix - Optional prefix to filter files
 * @param enabled - Whether the query should be enabled
 */
export function useZipFileEntriesQuery(
  fspName: string | undefined,
  zipFilePath: string | undefined,
  prefix?: string,
  enabled: boolean = true
): UseQueryResult<ZipFileEntry[], Error> {
  return useQuery({
    queryKey: [
      'zip',
      'entries',
      fspName || '',
      zipFilePath || '',
      prefix || ''
    ],
    queryFn: async () => {
      if (!fspName || !zipFilePath) {
        throw new Error('fspName and zipFilePath are required');
      }
      return await fetchZipFileEntries(fspName, zipFilePath, prefix);
    },
    enabled: enabled && !!fspName && !!zipFilePath,
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Fetch a page of detailed file entries from a ZIP archive.
 */
async function fetchZipFileEntriesPage(
  fspName: string,
  zipFilePath: string,
  offset: number,
  limit: number,
  prefix?: string
): Promise<ZipFileEntriesPage> {
  const url = buildZipListUrl(
    fspName,
    zipFilePath,
    prefix,
    true,
    offset,
    limit
  );
  const response = (await sendRequestAndThrowForNotOk(
    url,
    'GET'
  )) as ZipFileEntriesPage;
  return response;
}

/**
 * Hook to fetch detailed file entries from a ZIP archive with infinite scrolling.
 * Loads entries progressively as user requests more.
 *
 * @param fspName - The file share path name
 * @param zipFilePath - Path to the ZIP file within the FSP
 * @param pageSize - Number of entries per page (default 100)
 * @param enabled - Whether the query should be enabled
 */
export function useZipFileEntriesInfiniteQuery(
  fspName: string | undefined,
  zipFilePath: string | undefined,
  pageSize: number = 100,
  enabled: boolean = true
): UseInfiniteQueryResult<InfiniteData<ZipFileEntriesPage>, Error> {
  return useInfiniteQuery({
    queryKey: [
      'zip',
      'entries-infinite',
      fspName || '',
      zipFilePath || '',
      pageSize
    ],
    queryFn: async ({ pageParam = 0 }) => {
      if (!fspName || !zipFilePath) {
        throw new Error('fspName and zipFilePath are required');
      }
      return await fetchZipFileEntriesPage(
        fspName,
        zipFilePath,
        pageParam,
        pageSize
      );
    },
    initialPageParam: 0,
    getNextPageParam: lastPage => {
      if (lastPage.has_more) {
        return lastPage.offset + lastPage.limit;
      }
      return undefined;
    },
    enabled: enabled && !!fspName && !!zipFilePath,
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Fetch content from within a ZIP file.
 * Supports optional range requests.
 */
export async function fetchZipContent(
  fspName: string,
  zipFilePath: string,
  internalPath: string,
  options?: {
    signal?: AbortSignal;
    rangeStart?: number;
    rangeEnd?: number;
  }
): Promise<Uint8Array> {
  const url = buildZipContentUrl(fspName, zipFilePath, internalPath);

  const headers: HeadersInit = {};
  if (options?.rangeStart !== undefined && options?.rangeEnd !== undefined) {
    headers['Range'] = `bytes=${options.rangeStart}-${options.rangeEnd}`;
  }

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers,
    signal: options?.signal
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Failed to fetch ZIP content: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * A store implementation compatible with zarrita that reads from OZX archives
 * via the Fileglancer OZX API endpoints.
 *
 * This allows existing zarrita-based code to transparently read from OZX files.
 */
export class OzxFetchStore {
  private fspName: string;
  private ozxPath: string;
  private baseUrl: string;

  /**
   * Create a new OzxFetchStore.
   *
   * @param fspName - The file share path name
   * @param ozxPath - Path to the OZX file within the FSP
   */
  constructor(fspName: string, ozxPath: string) {
    this.fspName = fspName;
    this.ozxPath = ozxPath;
    // Compute base URL for logging
    this.baseUrl = getZipContentUrl(fspName, ozxPath, '');
    log.debug('Created OzxFetchStore for', this.baseUrl);
  }

  /**
   * Get full content of a file within the OZX archive.
   *
   * @param key - Path within the archive (e.g., "zarr.json", "0/c/0/0/0")
   * @returns File content as Uint8Array, or undefined if not found
   */
  async get(key: string): Promise<Uint8Array | undefined> {
    try {
      const url = buildZipContentUrl(this.fspName, this.ozxPath, key);
      const response = await sendFetchRequest(url, 'GET');

      if (!response.ok) {
        if (response.status === 404) {
          return undefined;
        }
        throw new Error(`Failed to fetch ${key}: ${response.status}`);
      }

      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      log.debug(`OzxFetchStore.get(${key}) error:`, error);
      return undefined;
    }
  }

  /**
   * Get a byte range from a file within the OZX archive.
   * This is the key method for efficient chunk access.
   *
   * @param key - Path within the archive
   * @param offset - Starting byte offset
   * @param length - Number of bytes to read
   * @returns File content range as Uint8Array, or undefined if not found
   */
  async getRange(
    key: string,
    offset: number,
    length: number
  ): Promise<Uint8Array | undefined> {
    try {
      const url = buildZipContentUrl(this.fspName, this.ozxPath, key);
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Range: `bytes=${offset}-${offset + length - 1}`
        }
      });

      if (!response.ok && response.status !== 206) {
        if (response.status === 404) {
          return undefined;
        }
        throw new Error(
          `Failed to fetch range from ${key}: ${response.status}`
        );
      }

      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      log.debug(
        `OzxFetchStore.getRange(${key}, ${offset}, ${length}) error:`,
        error
      );
      return undefined;
    }
  }

  /**
   * Check if a file exists in the OZX archive.
   *
   * @param key - Path within the archive
   * @returns True if the file exists
   */
  async has(key: string): Promise<boolean> {
    try {
      const url = buildZipContentUrl(this.fspName, this.ozxPath, key);
      const response = await fetch(url, {
        method: 'HEAD',
        credentials: 'include'
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List files in the OZX archive with optional prefix filter.
   *
   * @param prefix - Optional prefix to filter files
   * @returns Array of file paths
   */
  async list(prefix?: string): Promise<string[]> {
    return await fetchZipFileList(this.fspName, this.ozxPath, prefix);
  }

  /**
   * Get the base URL for this store (for debugging/logging).
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
}

/**
 * Hook to fetch content of a file within a ZIP archive.
 */
export function useZipFileContentQuery(
  fspName: string | undefined,
  zipFilePath: string | undefined,
  internalPath: string | undefined,
  enabled: boolean = true
): UseQueryResult<Uint8Array, Error> {
  return useQuery({
    queryKey: [
      'zip',
      'content',
      fspName || '',
      zipFilePath || '',
      internalPath || ''
    ],
    queryFn: async () => {
      if (!fspName || !zipFilePath || !internalPath) {
        throw new Error('fspName, zipFilePath, and internalPath are required');
      }
      return await fetchZipContent(fspName, zipFilePath, internalPath);
    },
    enabled: enabled && !!fspName && !!zipFilePath && !!internalPath,
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Create an OzxFetchStore for the given file.
 * This is a factory function for creating stores.
 *
 * @param fspName - The file share path name
 * @param ozxFilePath - Path to the OZX file within the FSP
 * @returns OzxFetchStore instance
 */
export function createOzxStore(
  fspName: string,
  ozxFilePath: string
): OzxFetchStore {
  return new OzxFetchStore(fspName, ozxFilePath);
}
