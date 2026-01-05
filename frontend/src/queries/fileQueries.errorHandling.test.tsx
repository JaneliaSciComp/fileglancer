import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useFileQuery from './fileQueries';
import * as utils from '@/utils';

// Mock the utils module
vi.mock('@/utils', async () => {
  const actual = await vi.importActual('@/utils');
  return {
    ...actual,
    sendFetchRequest: vi.fn(),
    buildUrl: (path: string) => path, // Simple mock for buildUrl
    makeMapKey: (type: string, name: string) => `${type}_${name}`
  };
});

// Mock the context
const mockZonesAndFspData = {
  'fsp_test-fsp': {
    name: 'test-fsp',
    path: '/test/path',
    type: 'posix'
  }
};

vi.mock('@/contexts/ZonesAndFspMapContext', () => ({
  useZoneAndFspMapContext: () => ({
    zonesAndFspQuery: {
      data: mockZonesAndFspData
    }
  })
}));

describe('useFileQuery 500 Error Reproduction', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false // Disable retries for faster tests
        }
      }
    });
    vi.clearAllMocks();
  });

  it('should handle 500 Internal Server Error correctly', async () => {
    // Arrange
    const fspName = 'test-fsp';
    const folderName = '';

    // Mock sendFetchRequest to return a 500 response with HTML body
    // and a json() method that fails (as it tries to parse HTML)
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      }
    };

    vi.mocked(utils.sendFetchRequest).mockResolvedValue(
      mockResponse as unknown as Response
    );

    // Act
    const { result } = renderHook(() => useFileQuery(fspName, folderName), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    });

    // Assert
    // We expect the query to eventually fail
    await waitFor(() => expect(result.current.isError).toBe(true), {
      timeout: 10000
    });

    // The bug is that it throws the SyntaxError from JSON parsing
    // instead of the "Server returned 500" error.
    // So this assertion confirms the BUG (on this branch)
    // or confirms the FIX (if the message is clean).

    // Since we want to REPRODUCE the failure, we check what it actually is.
    // If the bug is present, the error message will be the SyntaxError.
    // If the fix is present, it will be "Server returned 500 Internal Server Error".

    const error = result.current.error;
    console.log('Test caught error:', error?.message);

    // We want to verify that the code *should* be handling this,
    // so we Assert what we WANT (the fix).
    // This test definition asserts the correct behavior.
    // Running it on the buggy branch should FAIL this assertion.
    expect(error?.message).toBe('Server returned 500 Internal Server Error');
    expect(error?.message).not.toContain('Unexpected token');
  });
}, 15000);
