import log from 'loglevel';

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function logError(operation: string, error: unknown): void {
  log.error(`${operation} failed: ${formatError(error)}`);
}

function createErrorResult(operation: string, error: unknown) {
  logError(operation, error);
  return {
    success: false,
    error: formatError(error)
  };
}

export { createErrorResult };
