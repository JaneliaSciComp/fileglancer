import { sendFetchRequest } from '@/utils';
import { getErrorString } from '@/utils/errorHandling';
import logger from '@/logger';

export type ServerStatus = 'healthy' | 'down' | 'checking';

// Structured error response types
export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
}

// Known error codes for server health checking
export const ERROR_CODES = {
  SERVER_UNREACHABLE: 'SERVER_UNREACHABLE',
  SERVER_AUTH_FAILED: 'SERVER_AUTH_FAILED',
  SERVER_INVALID_RESPONSE: 'SERVER_INVALID_RESPONSE'
} as const;

export type ServerErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

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
 * Create a structured error response
 */
export function createApiError(
  code: ServerErrorCode,
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
 * Check if the server is healthy by hitting the version endpoint
 * This is a stable endpoint that should always return 200 when the server is working
 */
export async function checkServerHealth(
  xsrfToken: string
): Promise<ServerStatus> {
  try {
    const response = await sendFetchRequest('/api/version', 'GET', xsrfToken);

    // If we get a successful response, server connection is working
    if (response.ok) {
      return 'healthy';
    }

    // Any error suggests the server is down
    logger.warn(
      `Server health check failed: ${response.status} ${response.statusText}`
    );
    return 'down';
  } catch (error) {
    logger.warn(`Server health check error: ${getErrorString(error)}`);
    return 'down';
  }
}

/**
 * Determines if a failed request to the server should trigger a health check
 * Only check for requests that would normally succeed if the server is running
 */
export function shouldTriggerHealthCheck(
  apiPath: string,
  responseStatus?: number
): boolean {
  // Skip health check for the health check endpoint itself to avoid infinite loops
  if (apiPath.includes('/version')) {
    return false;
  }

  // Trigger health check for network errors or server errors (5xx)
  // Don't trigger for client errors like 404, 400, etc. as those are expected
  if (!responseStatus) {
    logger.info(
      `Health check triggered for network error on endpoint: ${apiPath}`
    );
    return true; // Network error (fetch failed)
  }

  const shouldTrigger = responseStatus >= 500;
  if (shouldTrigger) {
    logger.info(
      `Health check triggered for server error ${responseStatus} on endpoint: ${apiPath}`
    );
  }

  return shouldTrigger; // Server errors only
}
