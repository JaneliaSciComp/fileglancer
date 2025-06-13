import { BrowserRouter, Route, Routes } from 'react-router';
import { CookiesProvider } from 'react-cookie';
import { ErrorBoundary } from 'react-error-boundary';

import { MainLayout } from './layouts/MainLayout';
import { BrowseLayout } from './layouts/BrowseLayout';
import Home from '@/components/Home';
import Browse from '@/components/Browse';
import Help from '@/components/Help';
import Jobs from '@/components/Jobs';
import Preferences from '@/components/Preferences';
import Shared from '@/components/Shared';
import ErrorFallback from '@/components/ErrorFallback';

function Profile() {
  return (
    <div className="p-4">
      <h2 className="text-foreground text-lg">Profile Page</h2>
    </div>
  );
}

function Login() {
  return (
    <div className="p-4">
      <h2 className="text-foreground text-lg">Login Page</h2>
    </div>
  );
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
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<MainLayout />}>
          <Route path="shared" element={<Shared />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="help" element={<Help />} />
          <Route path="profile" element={<Profile />} />
          <Route path="preferences" element={<Preferences />} />
          <Route element={<BrowseLayout />}>
            <Route path="browse" element={<Browse />} />
            <Route index path="*" element={<Home />} />
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
