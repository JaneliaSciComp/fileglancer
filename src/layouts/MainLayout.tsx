import React from 'react';
import { Outlet } from 'react-router';
import { CookiesProvider } from '../contexts/CookiesContext';
import { FileBrowserContextProvider } from '../contexts/FileBrowserContext';
import FileglancerNavbar from '../components/ui/Navbar';
import { PreferencesProvider } from '../contexts/PreferencesContext';

export const MainLayout = () => {
  return (
    <CookiesProvider>
      <PreferencesProvider>
        <FileBrowserContextProvider>
          <div className="flex flex-col items-center h-svh w-full overflow-y-hidden bg-background text-foreground box-border">
            <FileglancerNavbar />
            <Outlet />
          </div>
        </FileBrowserContextProvider>
      </PreferencesProvider>
    </CookiesProvider>
  );
};
