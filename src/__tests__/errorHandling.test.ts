import { describe, test, expect, afterEach, beforeEach, vi } from 'vitest';
import { parseError, handleFailure } from '@/utils/errorHandling';

// Mock loglevel
vi.mock('loglevel', () => ({
  default: {
    error: vi.fn()
  }
}));

// Mock the react-hot-toast import
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn()
  }
}));

// Import the mocked modules
import toast from 'react-hot-toast';
import log from 'loglevel';

describe('parseError', () => {
  test('parses Error objects', () => {
    const error = new Error('Test error');
    expect(parseError(error)).toBe('Test error');
  });

  test('parses string errors', () => {
    const error = 'Test string error';
    expect(parseError(error)).toBe('Test string error');
  });

  test('parses object with "error" property', () => {
    const errorObj = { error: 'Test object error' };
    expect(parseError(errorObj)).toBe('Test object error');
  });

  test('parses Response objects with status and statusText', () => {
    const response = new Response(null, {
      status: 404,
      statusText: 'Not Found'
    });
    expect(parseError(response)).toBe('404: Not Found');
  });

  test('returns default message for unknown errors', () => {
    expect(parseError({})).toBe('An unknown error occurred');
  });
});

describe('handleFailure', () => {
  beforeEach(() => {
    // Clear mocks before each test
    vi.mocked(log.error).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('logs and displays error for Error objects', () => {
    const error = new Error('Test error');
    handleFailure('test action', error);
    expect(log.error).toHaveBeenCalledWith('Error test action:', error);
    expect(toast.error).toHaveBeenCalledWith('Error test action: Test error');
  });

  test('logs and displays error for fileglancer API response', async () => {
    const mockJsonPromise = Promise.resolve({ error: 'Test response error' });
    const response = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: vi.fn().mockReturnValue(mockJsonPromise)
    } as unknown as Response;

    handleFailure('test action', response);
    expect(log.error).toHaveBeenCalledWith('Error test action:', response);

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Error test action: 500 - Test response error'
      );
    });
  });

  test('logs and displays error for typical Response format', async () => {
    const response = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: vi.fn().mockRejectedValue(new Error('JSON parse error'))
    } as unknown as Response;

    handleFailure('test action', response);
    expect(log.error).toHaveBeenCalledWith('Error test action:', response);

    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Error test action: 500 Internal Server Error'
      );
    });
  });

  test('logs and displays error for string errors', () => {
    const error = 'Test string error';
    handleFailure('test action', error);
    expect(log.error).toHaveBeenCalledWith('Error test action:', error);
    expect(toast.error).toHaveBeenCalledWith(
      'Error test action: Test string error'
    );
  });

  test('logs and displays error for unknown error types', () => {
    handleFailure('test action', {});
    expect(log.error).toHaveBeenCalledWith(
      'Error test action:',
      expect.anything()
    );
    expect(toast.error).toHaveBeenCalledWith(
      'Error test action: An unknown error occurred'
    );
  });
});
