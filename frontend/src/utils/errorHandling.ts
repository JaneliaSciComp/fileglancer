import logger from '@/logger';
import type { Success, Failure } from '@/shared.types';

function createSuccess<T>(data: T): Success<T> {
  return { success: true, data };
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

export { createSuccess, handleError, getErrorString };
