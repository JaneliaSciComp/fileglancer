import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import './index.css';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20 * 1000 // 20 seconds; suggested as a minimum here: https://tkdodo.eu/blog/react-query-as-a-state-manager
    }
  }
});

// From Tanstack Query DevTools extension instructions
declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: import('@tanstack/query-core').QueryClient;
  }
}
window.__TANSTACK_QUERY_CLIENT__ = queryClient;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools />
    </QueryClientProvider>
  </StrictMode>
);
