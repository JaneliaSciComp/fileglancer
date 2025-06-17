import log from 'loglevel';
import { HTTPError } from '@/utils';

/**
 * Returns an error message for logging
 * Either error.message if it's an instance of Error, otherwise 'Unknown error'
 */
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Logs an error to console with loglevel library
 * Uses debug level for 404 errors, error level for all others
 */
function logError(operation: string, error: unknown): void {
  if (error instanceof HTTPError && error.responseCode === 404) {
    log.debug(`${operation} - resource not found: ${formatError(error)}`);
  } else {
    // Log all other errors as error level
    log.error(`${operation} failed: ${formatError(error)}`);
  }
  // TODO
  //   navigator.sendBeacon('/log', JSON.stringify({
  //     operation,
  //     error: formatError(error)
  //   }));
}

// Creates a consistent error result object
// with success: false and formatted error message
// Used inside tryCatchWrapper
function createErrorResult(operation: string, error: unknown) {
  logError(operation, error);
  return {
    success: false,
    error: formatError(error)
  };
}

// Wrapper function that executes an async operation
// and returns a consistent result object
// If the operation succeeds and returns data, returns { success: true, data: result }
// If the operation succeeds but returns undefined (void), returns { success: true }
// If it fails, returns { success: false, error: errorMessage }
async function tryCatchWrapper<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const result = await fn();
    // If the function runs w/o error but returns undefined (void),
    // we still want a consistent success result
    return result === undefined
      ? { success: true }
      : { success: true, data: result };
  } catch (error) {
    return createErrorResult(operation, error);
  }
}

export { tryCatchWrapper };
