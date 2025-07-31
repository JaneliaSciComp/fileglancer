import logger from '@/logger';
import type { Success, Failure, ApiFailure } from '@/shared.types';

function createSuccess<T>(data?: T): Success<T> {
  return { success: true, data };
}

async function getResponseError(response: Response): Promise<string> {
  const body = await response.json();
  return body.error ? body.error : 'Unknown error';
}

// Adding the option to return a ApiFailure Result type rather than
// throwing an error because different functions might want to
// handle response status codes differently. E.g., 404 might be an
// error sometimes, but for preferences, it just means that preference
// key hasn't been set yet.
async function createApiFailure(response: Response): Promise<ApiFailure> {
  const error = await getResponseError(response);
  return { success: false, code: response.status, error: error };
}

function createErrFailure(error: string): Failure {
  return { success: false, error };
}

function getErrorString(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unknown error occurred';
}

function handleError(error: unknown): Failure {
  logger.error(error);
  return createErrFailure(getErrorString(error));
}

async function handleBadResponse(response: Response): Promise<ApiFailure> {
  logger.error(response);
  return await createApiFailure(response);
}

export { createSuccess, handleError, handleBadResponse, getResponseError };
