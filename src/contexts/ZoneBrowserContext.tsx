import React from 'react';

import { FileSharePaths, FileSharePathItem } from '../shared.types';
import { getAPIPathRoot, sendGetRequest } from '../utils';
import { useCookiesContext } from '../contexts/CookiesContext';

type ZoneBrowserContextType = {
  fileSharePaths: FileSharePaths;
  currentNavigationZone: string | null;
  setCurrentNavigationZone: React.Dispatch<React.SetStateAction<string | null>>;
  getFileSharePaths: () => Promise<void>;
};

const ZoneBrowserContext = React.createContext<ZoneBrowserContextType | null>(
  null
);

export const useZoneBrowserContext = () => {
  const context = React.useContext(ZoneBrowserContext);
  if (!context) {
    throw new Error(
      'useZoneBrowserContext must be used within a ZoneBrowserProvider'
    );
  }
  return context;
};

export const ZoneBrowserContextProvider = ({
  children
}: {
  children: React.ReactNode;
}) => {
  const [fileSharePaths, setFileSharePaths] = React.useState<FileSharePaths>(
    {}
  );
  const [currentNavigationZone, setCurrentNavigationZone] = React.useState<
    string | null
  >(null);

  const { cookies } = useCookiesContext();

  React.useEffect(() => {
    if (Object.keys(fileSharePaths).length === 0) {
      getFileSharePaths();
    }
  }, [fileSharePaths, getFileSharePaths]);

  async function getFileSharePaths() {
    const url = `${getAPIPathRoot()}api/fileglancer/file-share-paths`;

    try {
      const response = await sendGetRequest(url, cookies['_xsrf']);

      const rawData: { paths: FileSharePathItem[] } = await response.json();
      const unsortedPaths: FileSharePaths = {};

      rawData.paths.forEach(item => {
        if (!unsortedPaths[item.zone]) {
          unsortedPaths[item.zone] = [];
        }

        // Store the entire FileSharePathItem object instead of just a string path
        if (
          !unsortedPaths[item.zone].some(
            existingItem => existingItem.name === item.name
          )
        ) {
          unsortedPaths[item.zone].push(item);
        }
      });

      // Sort the items within each zone alphabetically by name
      Object.keys(unsortedPaths).forEach(zone => {
        unsortedPaths[zone].sort((a, b) => a.name.localeCompare(b.name));
      });

      // Create a new object with alphabetically sorted zone keys
      const sortedPaths: FileSharePaths = {};
      Object.keys(unsortedPaths)
        .sort()
        .forEach(zone => {
          sortedPaths[zone] = unsortedPaths[zone];
        });

      setFileSharePaths(sortedPaths);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error('An unknown error occurred');
      }
    }
  }
  return (
    <ZoneBrowserContext.Provider
      value={{
        fileSharePaths,
        currentNavigationZone,
        setCurrentNavigationZone,
        getFileSharePaths
      }}
    >
      {children}
    </ZoneBrowserContext.Provider>
  );
};
