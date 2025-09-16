import { BrowserRouter, Route, Routes } from 'react-router';
import { CookiesProvider } from 'react-cookie';
import { ErrorBoundary } from 'react-error-boundary';

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

const Login = () => {
  return (
    <div className="p-4">
      <h2 className="text-foreground text-lg">Login Page</h2>
    </div>
  );
};

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
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route element={<Login />} path="/login" />
        <Route element={<MainLayout />} path="/*">
          <Route element={<OtherPagesLayout />}>
            <Route element={<Links />} path="links" />
            <Route element={<Jobs />} path="jobs" />
            <Route element={<Help />} path="help" />
            <Route element={<Preferences />} path="preferences" />
            <Route element={<Notifications />} path="notifications" />
          </Route>
          <Route element={<BrowsePageLayout />}>
            <Route element={<Browse />} path="browse" />
            <Route element={<Browse />} path="browse/:fspName" />
            <Route element={<Browse />} path="browse/:fspName/*" />
            <Route element={<Home />} index path="*" />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default function App() {
  return (
    <CookiesProvider>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <AppComponent />
      </ErrorBoundary>
    </CookiesProvider>
  );
}
