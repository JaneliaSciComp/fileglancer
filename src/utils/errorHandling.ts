import log from 'loglevel';

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(operation: string, error: unknown): void {
  log.error(`${operation} failed: ${formatError(error)}`);
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
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    return createErrorResult(operation, error);
  }
}

export { tryCatchWrapper };
