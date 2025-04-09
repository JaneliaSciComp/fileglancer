import { ReactWidget } from '@jupyterlab/ui-components';
import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { CookiesProvider } from 'react-cookie';
import { MainLayout } from './layouts/MainLayout';
import { FilesLayout } from './layouts/FilesLayout';
import Home from './components/Home';
import Files from './components/Files';
import Help from './components/Help';
import Jobs from './components/Jobs';

function Profile() {
  return (
    <div className="p-4">
      <h2 className="text-foreground text-lg">Profile</h2>
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

function Preferences() {
  return (
    <div className="p-4">
      <h2 className="text-foreground text-lg">Preferences Page</h2>
    </div>
  );
}

function getBasename() {
  const { pathname } = window.location;
  // Try to match /user/:username/lab
  const userLabMatch = pathname.match(/^\/jupyter\/user\/[^/]+\/lab/);
  if (userLabMatch) {
    // Return the matched part, e.g. "/user/<username>/lab"
    return userLabMatch[0];
  }
  // Otherwise, check if it starts with /lab
  if (pathname.startsWith('/lab')) {
    return '/lab';
  }
  // Fallback to root if no match is found
  return '/';
}

/**
 * React component for a counter.
 *
 * @returns The React component
 */
const AppComponent = (): JSX.Element => {
  const basename = getBasename();
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<MainLayout />}>
          <Route path="jobs" element={<Jobs />} />
          <Route path="help" element={<Help />} />
          <Route path="profile" element={<Profile />} />
          <Route path="preferences" element={<Preferences />} />
          <Route element={<FilesLayout />}>
            <Route path="files" element={<Files />} />
            <Route index path="*" element={<Home />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

/**
 * A Counter Lumino Widget that wraps a CounterComponent.
 */
export class AppWidget extends ReactWidget {
  /**
   * Constructs a new CounterWidget.
   */
  constructor() {
    super();
    this.addClass('jp-react-widget');
  }

  render(): JSX.Element {
    return (
      <CookiesProvider>
        <AppComponent />
      </CookiesProvider>
    );
  }
}
