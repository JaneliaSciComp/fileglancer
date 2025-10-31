// https://testing-library.com/docs/react-testing-library/setup
import React from 'react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { render, RenderOptions } from '@testing-library/react';
import { ErrorBoundary } from 'react-error-boundary';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ZonesAndFspMapContextProvider } from '@/contexts/ZonesAndFspMapContext';
import { FileBrowserContextProvider } from '@/contexts/FileBrowserContext';
import { PreferencesProvider } from '@/contexts/PreferencesContext';
import { ProxiedPathProvider } from '@/contexts/ProxiedPathContext';
import { OpenFavoritesProvider } from '@/contexts/OpenFavoritesContext';
import { TicketProvider } from '@/contexts/TicketsContext';
import { ProfileContextProvider } from '@/contexts/ProfileContext';
import { ExternalBucketProvider } from '@/contexts/ExternalBucketContext';
import { ServerHealthProvider } from '@/contexts/ServerHealthContext';
import ErrorFallback from '@/components/ErrorFallback';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
}

const FileBrowserTestingWrapper = ({
  children
}: {
  children: React.ReactNode;
}) => {
  const params = useParams();
  const fspName = params.fspName;
  const filePath = params['*'];

  return (
    <FileBrowserContextProvider fspName={fspName} filePath={filePath}>
      {children}
    </FileBrowserContextProvider>
  );
};

const Browse = ({ children }: { children: React.ReactNode }) => {
  return (
    <ServerHealthProvider>
      <ZonesAndFspMapContextProvider>
        <OpenFavoritesProvider>
          <FileBrowserTestingWrapper>
            <PreferencesProvider>
              <ExternalBucketProvider>
                <ProxiedPathProvider>
                  <ProfileContextProvider>
                    <TicketProvider>{children}</TicketProvider>
                  </ProfileContextProvider>
                </ProxiedPathProvider>
              </ExternalBucketProvider>
            </PreferencesProvider>
          </FileBrowserTestingWrapper>
        </OpenFavoritesProvider>
      </ZonesAndFspMapContextProvider>
    </ServerHealthProvider>
  );
};

const MockRouterAndProviders = ({
  children,
  initialEntries = ['/']
}: {
  children: React.ReactNode;
  initialEntries?: string[];
}) => {
  // Create a new QueryClient for each test to ensure isolation
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries in tests
        staleTime: 30 * 1000
      }
    }
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="browse" element={<Browse>{children}</Browse>} />
            <Route
              path="browse/:fspName"
              element={<Browse>{children}</Browse>}
            />
            <Route
              path="browse/:fspName/*"
              element={<Browse>{children}</Browse>}
            />
          </Routes>
        </MemoryRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  );
};

const customRender = (
  ui: React.ReactElement,
  options?: CustomRenderOptions
) => {
  const { initialEntries, ...renderOptions } = options || {};
  return render(ui, {
    wrapper: props => (
      <MockRouterAndProviders {...props} initialEntries={initialEntries} />
    ),
    ...renderOptions
  });
};

export * from '@testing-library/react';
export { customRender as render };
