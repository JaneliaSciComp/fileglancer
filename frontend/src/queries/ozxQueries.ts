/**
 * OZX (Zipped OME-Zarr) query hooks and store implementation.
 *
 * RFC-9 Spec: https://ngff.openmicroscopy.org/rfc/9/index.html
 */

import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
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
 * Build URL for accessing content within an OZX file.
 *
 * @param fspName - The file share path name
 * @param ozxFilePath - Path to the OZX file within the FSP
 * @param internalPath - Path within the OZX archive
 * @returns Properly encoded URL for the OZX content endpoint
 */
export function buildOzxContentUrl(
  fspName: string,
  ozxFilePath: string,
  internalPath: string
): string {
  // Build the path segment: fspName/ozxFilePath
  const pathSegment = `${fspName}/${ozxFilePath}`;
  return buildUrl('/api/ozx-content/', pathSegment, { subpath: internalPath });
}

/**
 * Build full URL for accessing content within an OZX file.
 * Returns absolute URL suitable for external use (e.g., zarrita stores).
 *
 * @param fspName - The file share path name
 * @param ozxFilePath - Path to the OZX file within the FSP
 * @param internalPath - Path within the OZX archive
 * @returns Absolute URL
 */
export function getOzxContentUrl(
  fspName: string,
  ozxFilePath: string,
  internalPath: string
): string {
  const relativePath = buildOzxContentUrl(fspName, ozxFilePath, internalPath);
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
 * Build URL for listing files in an OZX archive.
 */
export function buildOzxListUrl(
  fspName: string,
  ozxFilePath: string,
  prefix?: string
): string {
  const pathSegment = `${fspName}/${ozxFilePath}`;
  const params = prefix ? { prefix } : null;
  return buildUrl('/api/ozx-list/', pathSegment, params);
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
 * Fetch list of files in an OZX archive.
 */
async function fetchOzxFileList(
  fspName: string,
  ozxFilePath: string,
  prefix?: string
): Promise<string[]> {
  const url = buildOzxListUrl(fspName, ozxFilePath, prefix);
  const response = (await sendRequestAndThrowForNotOk(url, 'GET')) as {
    files: string[];
  };
  return response.files;
}

/**
 * Hook to fetch list of files in an OZX archive.
 *
 * @param fspName - The file share path name
 * @param ozxFilePath - Path to the OZX file within the FSP
 * @param prefix - Optional prefix to filter files
 * @param enabled - Whether the query should be enabled
 */
export function useOzxFileListQuery(
  fspName: string | undefined,
  ozxFilePath: string | undefined,
  prefix?: string,
  enabled: boolean = true
): UseQueryResult<string[], Error> {
  return useQuery({
    queryKey: ['ozx', 'files', fspName || '', ozxFilePath || '', prefix || ''],
    queryFn: async () => {
      if (!fspName || !ozxFilePath) {
        throw new Error('fspName and ozxFilePath are required');
      }
      return await fetchOzxFileList(fspName, ozxFilePath, prefix);
    },
    enabled: enabled && !!fspName && !!ozxFilePath,
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Fetch content from within an OZX file.
 * Supports optional range requests.
 */
export async function fetchOzxContent(
  fspName: string,
  ozxFilePath: string,
  internalPath: string,
  options?: {
    signal?: AbortSignal;
    rangeStart?: number;
    rangeEnd?: number;
  }
): Promise<Uint8Array> {
  const url = buildOzxContentUrl(fspName, ozxFilePath, internalPath);

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
    throw new Error(`Failed to fetch OZX content: ${response.status}`);
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
    this.baseUrl = getOzxContentUrl(fspName, ozxPath, '');
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
      const url = buildOzxContentUrl(this.fspName, this.ozxPath, key);
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
      const url = buildOzxContentUrl(this.fspName, this.ozxPath, key);
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
      const url = buildOzxContentUrl(this.fspName, this.ozxPath, key);
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
    return await fetchOzxFileList(this.fspName, this.ozxPath, prefix);
  }

  /**
   * Get the base URL for this store (for debugging/logging).
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }
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
