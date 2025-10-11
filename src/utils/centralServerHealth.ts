import { sendFetchRequest } from '@/utils';
import { getErrorString } from '@/utils/errorHandling';
import logger from '@/logger';

export type CentralServerStatus = 'healthy' | 'down' | 'checking' | 'ignore';

// Structured error response types
export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

// Known error codes for central server health checking
export const ERROR_CODES = {
  CENTRAL_SERVER_NOT_CONFIGURED: 'CENTRAL_SERVER_NOT_CONFIGURED',
  CENTRAL_SERVER_UNREACHABLE: 'CENTRAL_SERVER_UNREACHABLE',
  CENTRAL_SERVER_AUTH_FAILED: 'CENTRAL_SERVER_AUTH_FAILED',
  CENTRAL_SERVER_INVALID_RESPONSE: 'CENTRAL_SERVER_INVALID_RESPONSE'
} as const;

export type CentralServerErrorCode =
  (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * Type guard to check if an object is a valid ApiErrorResponse
 */
export function isApiErrorResponse(obj: unknown): obj is ApiErrorResponse {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'code' in obj &&
    'message' in obj &&
    typeof (obj as Record<string, unknown>).code === 'string' &&
    typeof (obj as Record<string, unknown>).message === 'string' &&
    (!('details' in obj) ||
      (obj as Record<string, unknown>).details !== undefined)
  );
}

/**
 * Check if an error response indicates a configuration issue rather than connectivity issue
 */
function isConfigurationError(errorData: ApiErrorResponse): boolean {
  // Check for structured error code first
  if (errorData.code === ERROR_CODES.CENTRAL_SERVER_NOT_CONFIGURED) {
    return true;
  }

  // Could add other configuration-related error codes here in the future
  return false;
}

/**
 * Safely parse error response with proper typing
 */
async function parseErrorResponse(
  response: Response
): Promise<ApiErrorResponse | null> {
  try {
    const errorData = await response.json();

    // Validate the response has the expected structure using type guard
    if (isApiErrorResponse(errorData)) {
      return errorData;
    }

    // If it doesn't match our structured format, return null
    logger.debug(
      'Error response does not match expected ApiErrorResponse structure:',
      errorData
    );
    return null;
  } catch (parseError) {
    logger.debug('Failed to parse error response as JSON:', parseError);
    return null;
  }
}

/**
 * Create a structured error response
 */
export function createApiError(
  code: CentralServerErrorCode,
  message: string,
  details?: unknown
): ApiErrorResponse {
  return {
    code,
    message,
    details
  };
}

/**
 * Check if the central server is healthy by hitting the version endpoint
 * This is a stable endpoint that should always return 200 when the central server is working
 */
export async function checkCentralServerHealth(
  xsrfToken: string
): Promise<CentralServerStatus> {
  try {
    const response = await sendFetchRequest(
      '/api/central-version',
      'GET',
      xsrfToken
    );

    // If we get a successful response (including not-configured), central server connection is working
    if (response.ok) {
      return 'healthy';
    }

    // Handle 500 errors - could be configuration issues or actual server problems
    if (response.status === 500) {
      const errorData = await parseErrorResponse(response);

      if (errorData && isConfigurationError(errorData)) {
        logger.info(
          `Central server configuration issue detected: ${errorData.message}`
        );
        return 'ignore'; // Configuration issue, not connectivity issue
      }

      // If we can't parse the error or it's not a config issue, treat as server down
      logger.warn(
        `Central server returned 500 error: ${errorData?.message || 'Unknown error'}`
      );
    }

    // Any other error suggests the central server is down
    logger.warn(
      `Central server health check failed: ${response.status} ${response.statusText}`
    );
    return 'down';
  } catch (error) {
    logger.warn(`Central server health check error: ${getErrorString(error)}`);
    return 'down';
  }
}

/**
 * Determines if a failed request to the central server should trigger a health check
 * Only check for requests that would normally succeed if the central server is running
 */
export function shouldTriggerHealthCheck(
  apiPath: string,
  responseStatus?: number
): boolean {
  // Skip health check for the health check endpoint itself to avoid infinite loops
  if (apiPath.includes('/central-version')) {
    return false;
  }

  // Skip health check for local/non-central server endpoints
  const localEndpoints = [
    '/api/profile', // User profile is local
    '/api/version', // Local server version
    '/api/files', // File system access
    '/api/content' // File content access
  ];

  const isLocalEndpoint = localEndpoints.some(endpoint =>
    apiPath.includes(endpoint)
  );

  if (isLocalEndpoint) {
    return false;
  }

  // Only trigger health check for central server related endpoints
  const centralServerEndpoints = [
    '/api/notifications',
    '/api/proxied-path',
    '/api/file-share-paths',
    '/api/external-buckets',
    '/api/preference' // Preferences are stored on central server when configured
  ];

  const isCentralServerEndpoint = centralServerEndpoints.some(endpoint =>
    apiPath.includes(endpoint)
  );

  if (!isCentralServerEndpoint) {
    return false;
  }

  // Trigger health check for network errors or server errors
  // Don't trigger for client errors like 404, 400, etc. as those are expected
  if (!responseStatus) {
    logger.info(
      `Health check triggered for network error on central server endpoint: ${apiPath}`
    );
    return true; // Network error (fetch failed)
  }

  const shouldTrigger = responseStatus >= 500;
  if (shouldTrigger) {
    logger.info(
      `Health check triggered for server error ${responseStatus} on central server endpoint: ${apiPath}`
    );
  }

  return shouldTrigger; // Server errors only
}
