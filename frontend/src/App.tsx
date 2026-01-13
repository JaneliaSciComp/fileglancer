import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router';
import { ErrorBoundary } from 'react-error-boundary';

import { AuthContextProvider, useAuthContext } from '@/contexts/AuthContext';
import { MainLayout } from './layouts/MainLayout';
import { BrowsePageLayout } from './layouts/BrowseLayout';
import { OtherPagesLayout } from './layouts/OtherPagesLayout';
import Login from '@/components/Login';
import Browse from '@/components/Browse';
import Help from '@/components/Help';
import Jobs from '@/components/Jobs';
import Preferences from '@/components/Preferences';
import Links from '@/components/Links';
import Notifications from '@/components/Notifications';
import SSHKeys from '@/components/SSHKeys';
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

  // If not authenticated, redirect to login page with the current URL as 'next' parameter
  if (!authStatus?.authenticated) {
    const currentPath =
      window.location.pathname + window.location.search + window.location.hash;
    const encodedNext = encodeURIComponent(currentPath);
    window.location.href = `/login?next=${encodedNext}`;
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-foreground">Redirecting to login...</div>
      </div>
    );
  }

  return children;
}

/**
 * Root redirect component that handles smart routing based on auth status
 * This component serves as a safe landing page after login to allow
 * auth queries to update before navigating to protected routes
 */
function RootRedirect() {
  const { loading, authStatus } = useAuthContext();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const nextUrl = urlParams.get('next');

    if (authStatus?.authenticated) {
      // User is authenticated - navigate to next URL or default to /browse
      const destination =
        nextUrl && nextUrl.startsWith('/') ? nextUrl : '/browse';
      navigate(destination, { replace: true });
    } else {
      // User is not authenticated - redirect to login
      const encodedNext = nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : '';
      navigate(`/login${encodedNext}`, { replace: true });
    }
  }, [loading, authStatus, navigate]);

  // Show loading state while determining where to route
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-foreground">Loading...</div>
    </div>
  );
}

const AppComponent = () => {
  const tasksEnabled = import.meta.env.VITE_ENABLE_TASKS === 'true';
  const sshKeysEnabled = import.meta.env.VITE_ENABLE_SSH_KEYS === 'true';

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />} path="/*">
          <Route element={<OtherPagesLayout />}>
            <Route element={<RootRedirect />} index />
            <Route element={<Login />} path="login" />
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
            {sshKeysEnabled ? (
              <Route
                element={
                  <RequireAuth>
                    <SSHKeys />
                  </RequireAuth>
                }
                path="ssh-keys"
              />
            ) : null}
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
