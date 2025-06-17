import log from 'loglevel';

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

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

function createErrorResult(operation: string, error: unknown) {
  logError(operation, error);
  return {
    success: false,
    error: formatError(error)
  };
}

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
