import React from 'react';
import { Outlet } from 'react-router';
import { CookiesProvider } from '../contexts/CookiesContext';
import { ZoneBrowserContextProvider } from '../contexts/ZoneBrowserContext';
import { FileBrowserContextProvider } from '../contexts/FileBrowserContext';
import { PreferencesProvider } from '../contexts/PreferencesContext';
import FileglancerNavbar from '../components/ui/Navbar';

export const MainLayout = () => {
  return (
    <CookiesProvider>
      <ZoneBrowserContextProvider>
        <PreferencesProvider>
          <FileBrowserContextProvider>
            <div className="flex flex-col items-center h-full w-full overflow-y-hidden bg-background text-foreground box-border">
              <FileglancerNavbar />
              <Outlet />
            </div>
          </FileBrowserContextProvider>
        </PreferencesProvider>
      </ZoneBrowserContextProvider>
    </CookiesProvider>
  );
};
