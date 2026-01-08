import { default as log } from '@/logger';
import {
  escapePathForUrl,
  getFileURL,
  getLastSegmentFromPath,
  getPreferredPathForDisplay,
  joinPaths,
  makeBrowseLink,
  makePathSegmentArray,
  removeLastSegmentFromPath
} from './pathHandling';
import { shouldTriggerHealthCheck } from './serverHealth';
import { queryClient } from '@/queryClient';
import type { FetchRequestOptions } from '@/shared.types';

// Health check reporter registry with robust type safety
export type HealthCheckReporter = (
  apiPath: string,
  responseStatus?: number
) => Promise<void>;

class HealthCheckRegistry {
  private reporter: HealthCheckReporter | null = null;
  private isEnabled: boolean = true;

  setReporter(reporter: HealthCheckReporter): void {
    if (typeof reporter !== 'function') {
      throw new Error('Health check reporter must be a function');
    }
    this.reporter = reporter;
  }

  clearReporter(): void {
    this.reporter = null;
  }

  getReporter(): HealthCheckReporter | null {
    return this.isEnabled ? this.reporter : null;
  }

  disable(): void {
    this.isEnabled = false;
  }

  enable(): void {
    this.isEnabled = true;
  }

  isReporterSet(): boolean {
    return this.reporter !== null;
  }
}

// Create singleton instance
const healthCheckRegistry = new HealthCheckRegistry();

// Export convenience functions for backward compatibility
export function setHealthCheckReporter(reporter: HealthCheckReporter): void {
  healthCheckRegistry.setReporter(reporter);
}

export function clearHealthCheckReporter(): void {
  healthCheckRegistry.clearReporter();
}

// Export registry for advanced usage
export { healthCheckRegistry };

const formatFileSize = (sizeInBytes: number): string => {
  if (sizeInBytes < 1024) {
    return `${sizeInBytes} bytes`;
  } else if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(0)} KB`;
  } else if (sizeInBytes < 1024 * 1024 * 1024) {
    return `${(sizeInBytes / (1024 * 1024)).toFixed(0)} MB`;
  } else {
    return `${(sizeInBytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
  }
};

const formatUnixTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatDateString = (dateStr: string) => {
  // If dateStr does not end with 'Z' or contain a timezone offset, treat as UTC
  let normalized = dateStr;
  if (!/Z$|[+-]\d{2}:\d{2}$/.test(dateStr)) {
    normalized = dateStr + 'Z';
  }
  const date = new Date(normalized);
  return date.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  });
};

class HTTPError extends Error {
  responseCode: number;

  constructor(message: string, responseCode: number) {
    super(message);
    this.responseCode = responseCode;
  }
}

async function checkSessionValidity(): Promise<{
  authenticated: boolean;
  auth_method?: string;
}> {
  try {
    const response = await fetch('/api/auth/status', {
      method: 'GET',
      credentials: 'include'
    });

    // if the response JSON contains { authenticated: true }, session is valid
    const data = await response.json();
    if (data && typeof data.authenticated === 'boolean') {
      return {
        authenticated: data.authenticated,
        auth_method: data.auth_method
      };
    }
    return { authenticated: false, auth_method: data.auth_method };
  } catch (error) {
    log.error('Error checking session validity:', error);
    return { authenticated: false, auth_method: 'okta' };
  }
}

// Define a more specific type for request body
type RequestBody = Record<string, unknown>;

async function sendFetchRequest(
  apiPath: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: RequestBody,
  options?: FetchRequestOptions
): Promise<Response> {
  const requestOptions: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      ...(method !== 'GET' &&
        method !== 'DELETE' && { 'Content-Type': 'application/json' })
    },
    ...(method !== 'GET' &&
      method !== 'DELETE' &&
      body && { body: JSON.stringify(body) }),
    ...(options?.signal && { signal: options.signal })
  };

  let response: Response;
  try {
    response = await fetch(apiPath, requestOptions);
  } catch (error) {
    // Report network errors to central server health monitoring if applicable
    const reporter = healthCheckRegistry.getReporter();
    if (reporter && shouldTriggerHealthCheck(apiPath)) {
      try {
        await reporter(apiPath);
      } catch (healthError) {
        // Don't let health check errors interfere with the original request
        log.debug(
          'Error reporting network failure to health checker:',
          healthError
        );
      }
    }
    throw error;
  }

  // Check for 403 Forbidden - could be permission denied or session expired
  if (response.status === 403 || response.status === 401) {
    // Check if session is still valid by testing a stable endpoint
    const sessionStatus = await checkSessionValidity();
    if (!sessionStatus.authenticated) {
      // Session has expired, update auth status in query cache
      queryClient.setQueryData(['auth', 'status'], {
        authenticated: false,
        auth_method: sessionStatus.auth_method
      });
      throw new HTTPError('Session expired', 401);
    }
    // If session is valid, this is just a permission denied for this specific resource
  }

  // Report failed requests to central server health monitoring if applicable
  if (!response.ok) {
    const reporter = healthCheckRegistry.getReporter();
    if (reporter && shouldTriggerHealthCheck(apiPath, response.status)) {
      try {
        await reporter(apiPath, response.status);
      } catch (error) {
        // Don't let health check errors interfere with the original request
        log.debug('Error reporting failed request to health checker:', error);
      }
    }
  }

  return response;
}

// Parse the Unix-style permissions string (e.g., "drwxr-xr-x")
const parsePermissions = (permissionString: string) => {
  // Owner permissions (positions 1-3)
  const ownerRead = permissionString[1] === 'r';
  const ownerWrite = permissionString[2] === 'w';

  // Group permissions (positions 4-6)
  const groupRead = permissionString[4] === 'r';
  const groupWrite = permissionString[5] === 'w';

  // Others/everyone permissions (positions 7-9)
  const othersRead = permissionString[7] === 'r';
  const othersWrite = permissionString[8] === 'w';

  return {
    owner: { read: ownerRead, write: ownerWrite },
    group: { read: groupRead, write: groupWrite },
    others: { read: othersRead, write: othersWrite }
  };
};

/**
 * Used to access objects in the ZonesAndFileSharePathsMap or in the zone, fsp, or folder preference maps
 * @param type zone, fsp, or folder
 * @param name for zones or FSPs, use zone.name or fsp.name. For folders, the name is defined as `${fsp.name}_${folder.path}`
 * @returns a map key string
 */
function makeMapKey(type: 'zone' | 'fsp' | 'folder', name: string): string {
  return `${type}_${name}`;
}

/**
 * Constructs a properly encoded URL from base URL, optional path, and optional query parameters.
 *
 * Two overloads:
 * 1. URLs with a single path segment and/or query parameters
 * 2. URLs with multi-segment path strings (S3-style)
 *
 * @param baseUrl - The base URL (e.g., '/api/files/' or 'https://viewer.example.com/')
 * @param singlePathSegment - Single path segment, encoded with encodeURIComponent (Overload 1)
 * @param queryParams - Query parameters as key-value pairs (Overload 1 only)
 *
 * OR
 *
 * @param baseUrl - The base URL (e.g., 'https://s3.example.com/bucket')
 * @param multiSegmentPathString - Path with '/' separators, encoded with escapePathForUrl (Overload 2)
 * @returns A properly encoded URL string
 *
 * @example
 * // Overload 1: URL with single segment
 * buildUrl('/api/files/', 'myFSP', null)
 * // Returns: '/api/files/myFSP'
 *
 * @example
 * // Overload 1: URL with query params only
 * buildUrl('/api/endpoint', null, { key: 'value' })
 * // Returns: '/api/endpoint?key=value'
 *
 * @example
 * // Overload 1: URL with single segment and query params
 * buildUrl('/api/files/', 'myFSP', { subpath: 'folder/file.txt' })
 * // Returns: '/api/files/myFSP?subpath=folder%2Ffile.txt'
 *
 * @example
 * // Overload 2: External URL with multi-segment path
 * buildUrl('https://s3.example.com/bucket', 'folder/file 100%.zarr')
 * // Returns: 'https://s3.example.com/bucket/folder/file%20100%25.zarr'
 */
function buildUrl(
  baseUrl: string,
  singlePathSegment: string | null,
  queryParams: Record<string, string> | null
): string;
function buildUrl(baseUrl: string, multiSegmentPathString: string): string;
function buildUrl(
  baseUrl: string,
  pathParam?: string | null,
  queryParams?: Record<string, string> | null
): string {
  // Remove trailing slash from base URL if present
  let url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  // Handle path parameter if provided
  if (pathParam) {
    if (queryParams !== undefined) {
      // Overload 1: Single path segment (queryParams is null or object)
      const encodedSegment = encodeURIComponent(pathParam);
      url = joinPaths(url, encodedSegment);
    } else {
      // Overload 2: Multi-segment path string (only 2 params)
      const encodedPath = escapePathForUrl(pathParam);
      url = `${url}/${encodedPath}`;
    }
  }

  // Add query parameters if provided and not null
  if (queryParams && Object.keys(queryParams).length > 0) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      searchParams.append(key, value);
    }
    url += `?${searchParams.toString()}`;
  }

  return url;
}

export {
  buildUrl,
  checkSessionValidity,
  escapePathForUrl,
  formatDateString,
  formatUnixTimestamp,
  formatFileSize,
  getFileURL,
  getLastSegmentFromPath,
  getPreferredPathForDisplay,
  joinPaths,
  makeBrowseLink,
  makeMapKey,
  makePathSegmentArray,
  parsePermissions,
  removeLastSegmentFromPath,
  sendFetchRequest
};
export type { RequestBody };

// Re-export retry utility
export { createRetryWithBackoff } from './retryWithBackoff';
export type {
  RetryOptions,
  RetryCallbacks,
  RetryState
} from './retryWithBackoff';
