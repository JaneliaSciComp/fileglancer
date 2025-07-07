import toast from 'react-hot-toast';
import log from 'loglevel';

/**
 * Parses an error object or string to extract a meaningful error message.
 * It handles Error objects, string messages, and responses from the fileglancer API.
 *
 * @param error - The error object or string to parse.
 * @returns A string containing the parsed error message.
 */
const parseError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  } else if (typeof error === 'string') {
    return error;
  } else if (error && typeof error === 'object') {
    const errorObj = error as Record<string, unknown>;
    // "error" property is used in fileglancer API responses
    if (errorObj.error && typeof errorObj.error === 'string') {
      return errorObj.error;
    } else if (errorObj.status && errorObj.statusText) {
      // Fallback for typical Response objects
      return `${errorObj.status}: ${errorObj.statusText}`;
    }
  }
  return 'An unknown error occurred';
};

/**
 * Handles errors by logging them and displaying a toast notification.
 * It can handle both Error objects and Response objects.
 *
 * @param action - The action being performed when the error occurred.
 * @param errorOrResponse - The error or response object containing error details.
 */
const handleFailure = (action: string, errorOrResponse: unknown) => {
  log.error(`Error ${action}:`, errorOrResponse);

  // Handle Response objects
  if (
    errorOrResponse &&
    typeof errorOrResponse === 'object' &&
    'ok' in errorOrResponse &&
    !errorOrResponse.ok
  ) {
    const response = errorOrResponse as Response;

    response
      .json()
      .then(errorData => {
        const errorMessage = parseError(errorData);
        toast.error(`Error ${action}: ${response.status} - ${errorMessage}`);
      })
      .catch(() => {
        toast.error(
          `Error ${action}: ${response.status} ${response.statusText}`
        );
      });
  } else {
    // Handle string error msgs and Error objects
    const description = parseError(errorOrResponse);
    toast.error(`Error ${action}: ${description}`);
  }
};

export { handleFailure, parseError };
