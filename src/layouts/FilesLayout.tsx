import React from 'react';
import { Outlet } from 'react-router';
import FileSidebar from '../components/ui/FileSidebar';
import { ZoneBrowserContextProvider } from '../contexts/ZoneBrowserContext';

export const FilesLayout = () => {
  return (
    <ZoneBrowserContextProvider>
      <div className="flex h-full w-full overflow-y-hidden">
        <FileSidebar />
        <Outlet />
      </div>
    </ZoneBrowserContextProvider>
  );
};
