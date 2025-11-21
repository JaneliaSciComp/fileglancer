import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000 // 30 seconds; 20s is the minimum suggested here: https://tkdodo.eu/blog/react-query-as-a-state-manager
    }
  }
});

// From Tanstack Query DevTools extension instructions
declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: import('@tanstack/query-core').QueryClient;
  }
}

// Only set on window if running in browser environment
if (typeof window !== 'undefined') {
  window.__TANSTACK_QUERY_CLIENT__ = queryClient;
}
