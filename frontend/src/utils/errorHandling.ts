import logger from '@/logger';
import type { Success, Failure } from '@/shared.types';

function createSuccess<T>(data: T): Success<T> {
  return { success: true, data };
}

async function toHttpError(response: Response): Promise<Error> {
  let body = { error: null };
  try {
    if (!response.bodyUsed) {
      body = await response.json();
    }
  } catch (error) {
    logger.error('Error parsing JSON response:', error);
  }
  return new Error(
    body.error ? body.error : `Unknown error (${response.status})`
  );
}

function createFailure(error: string): Failure {
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
  const errorString = getErrorString(error);
  logger.error(errorString);
  return createFailure(errorString);
}

export { createSuccess, handleError, toHttpError, getErrorString };
