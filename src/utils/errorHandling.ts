import logger from '@/logger';
import type { Success, Failure, ApiFailure } from '@/shared.types';

function createSuccess<T>(data?: T): Success<T> {
  return { success: true, data };
}

async function createApiFailure(response: Response): Promise<ApiFailure> {
  const body = await response.json();
  const error = body.error ? body.error : 'Unknown error';
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

export { createSuccess, handleError, handleBadResponse };
