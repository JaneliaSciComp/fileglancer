import type { ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ErrorBoundary } from 'react-error-boundary';

import { AuthContextProvider, useAuthContext } from '@/contexts/AuthContext';
import { MainLayout } from './layouts/MainLayout';
import { BrowsePageLayout } from './layouts/BrowseLayout';
import { OtherPagesLayout } from './layouts/OtherPagesLayout';
import Home from '@/components/Home';
import Browse from '@/components/Browse';
import Help from '@/components/Help';
import Jobs from '@/components/Jobs';
import Preferences from '@/components/Preferences';
import Links from '@/components/Links';
import Notifications from '@/components/Notifications';
import ErrorFallback from '@/components/ErrorFallback';

function RequireAuth({ children }: { readonly children: ReactNode }) {
  const { loading, authStatus } = useAuthContext();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    );
  }

  // If not authenticated, redirect to home page
  if (!authStatus?.authenticated) {
    window.location.href = '/fg/';
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-foreground">Redirecting to login...</div>
      </div>
    );
  }

  return children;
}

function getBasename() {
  const { pathname } = window.location;
  // Try to match /user/:username/lab
  const userLabMatch = pathname.match(/^\/user\/[^/]+\/fg/);
  if (userLabMatch) {
    // Return the matched part, e.g. "/user/<username>/lab"
    return userLabMatch[0];
  }
  // Otherwise, check if it starts with /lab
  if (pathname.startsWith('/fg')) {
    return '/fg';
  }
  // Fallback to root if no match is found
  return '/fg';
}

/**
 * React component for a counter.
 *
 * @returns The React component
 */
const AppComponent = () => {
  const basename = getBasename();
  const tasksEnabled = import.meta.env.VITE_ENABLE_TASKS === 'true';

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route element={<MainLayout />} path="/*">
          <Route element={<OtherPagesLayout />}>
            <Route element={<Home />} index />
            <Route
              element={
                <RequireAuth>
                  <Links />
                </RequireAuth>
              }
              path="links"
            />
            {tasksEnabled ? (
              <Route
                element={
                  <RequireAuth>
                    <Jobs />
                  </RequireAuth>
                }
                path="jobs"
              />
            ) : null}
            <Route element={<Help />} path="help" />
            <Route
              element={
                <RequireAuth>
                  <Preferences />
                </RequireAuth>
              }
              path="preferences"
            />
            <Route
              element={
                <RequireAuth>
                  <Notifications />
                </RequireAuth>
              }
              path="notifications"
            />
          </Route>
          <Route
            element={
              <RequireAuth>
                <BrowsePageLayout />
              </RequireAuth>
            }
          >
            <Route element={<Browse />} path="browse" />
            <Route element={<Browse />} path="browse/:fspName" />
            <Route element={<Browse />} path="browse/:fspName/*" />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default function App() {
  return (
    <AuthContextProvider>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <AppComponent />
      </ErrorBoundary>
    </AuthContextProvider>
  );
}
