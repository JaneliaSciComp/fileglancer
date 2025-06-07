import React from 'react';
import { Zone, FileOrFolder, FileSharePath } from '@/shared.types';
import { getFileBrowsePath, sendFetchRequest } from '@/utils';
import { useCookiesContext } from './CookiesContext';
import { useZoneAndFspMapContext } from './ZonesAndFspMapContext';
import { usePreferencesContext } from './PreferencesContext';

type FileBrowserContextType = {
  files: FileOrFolder[];
  currentFileOrFolder: FileOrFolder | null;
  currentFileSharePath: FileSharePath | null;
  setCurrentFileSharePath: React.Dispatch<
    React.SetStateAction<FileSharePath | null>
  >;
  setCurrentFileOrFolder: React.Dispatch<
    React.SetStateAction<FileOrFolder | null>
  >;
  updateCurrentFileOrFolder: (args: {
    fspName: string;
    path?: string;
  }) => Promise<void>;
  handleFileBrowserNavigation: (args: {
    fspName?: string;
    path?: string;
  }) => Promise<void>;
};

const FileBrowserContext = React.createContext<FileBrowserContextType | null>(
  null
);

export const useFileBrowserContext = () => {
  const context = React.useContext(FileBrowserContext);
  if (!context) {
    throw new Error(
      'useFileBrowserContext must be used within a FileBrowserContextProvider'
    );
  }
  return context;
};

export const FileBrowserContextProvider = ({
  children
}: {
  children: React.ReactNode;
}) => {
  const [files, setFiles] = React.useState<FileOrFolder[]>([]);
  const [currentFileOrFolder, setCurrentFileOrFolder] =
    React.useState<FileOrFolder | null>(null);
  const [currentFileSharePath, setCurrentFileSharePath] =
    React.useState<FileSharePath | null>(null);

  const { cookies } = useCookiesContext();
  const { zonesAndFileSharePathsMap, isZonesMapReady } =
    useZoneAndFspMapContext();
  const { fileSharePathFavorites, isFileSharePathFavoritesReady } =
    usePreferencesContext();

  const updateCurrentFileOrFolder = React.useCallback(
    async ({ fspName, path }: { fspName: string; path?: string }) => {
      const url = getFileBrowsePath(fspName, path);
      try {
        const response = await sendFetchRequest(url, 'GET', cookies['_xsrf']);
        const data = await response.json();
        if (data) {
          setCurrentFileOrFolder(data['info'] as FileOrFolder);
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error(error.message);
        } else {
          console.error('An unknown error occurred');
        }
      }
    },
    [cookies]
  );

  const fetchAndFormatFilesForDisplay = React.useCallback(
    async ({ fspName, path }: { fspName: string; path?: string }) => {
      const url = path
        ? getFileBrowsePath(fspName, path)
        : getFileBrowsePath(fspName);

      let data = [];
      try {
        const response = await sendFetchRequest(url, 'GET', cookies['_xsrf']);
        data = await response.json();

        if (data.files) {
          // display directories first, then files
          // within a type (directories or files), display alphabetically
          data.files = data.files.sort((a: FileOrFolder, b: FileOrFolder) => {
            if (a.is_dir === b.is_dir) {
              return a.name.localeCompare(b.name);
            }
            return a.is_dir ? -1 : 1;
          });
          setFiles(data.files as FileOrFolder[]);
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error(error.message);
        } else {
          console.error('An unknown error occurred');
        }
      }
    },
    [cookies]
  );

  const handleFileBrowserNavigation = React.useCallback(
    async ({ fspName, path }: { fspName?: string; path?: string }) => {
      const fetchPathFsp = fspName || currentFileSharePath?.name;
      if (!fetchPathFsp) {
        throw new Error('No current file share path set');
      }
      try {
        await fetchAndFormatFilesForDisplay({
          fspName: fetchPathFsp,
          ...(path && { path })
        });
        if (!currentFileOrFolder || currentFileOrFolder.path !== path) {
          await updateCurrentFileOrFolder({
            fspName: fetchPathFsp,
            ...(path && { path })
          });
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          console.error(`Failed to navigate: ${error.message}`);
        } else {
          console.error('An unknown error occurred while navigating');
        }
      }
    },
    [
      currentFileSharePath,
      fetchAndFormatFilesForDisplay,
      updateCurrentFileOrFolder,
      currentFileOrFolder
    ]
  );

  React.useEffect(() => {
    // Only run if zones are ready and fileSharePathFavorites have been loaded (not undefined)
    if (!isZonesMapReady || !isFileSharePathFavoritesReady) {
      return;
    }

    // Only set if currentFileSharePath is not set
    if (!currentFileSharePath) {
      if (fileSharePathFavorites.length > 0) {
        setCurrentFileSharePath(() => fileSharePathFavorites[0]);
      } else {
        // Otherwise, fallback to first FSP in the map
        const zones = Object.values(zonesAndFileSharePathsMap).filter(
          (item): item is Zone => (item as Zone).fileSharePaths !== undefined
        );
        const firstFsp =
          zones.length > 0 && zones[0].fileSharePaths.length > 0
            ? zones[0].fileSharePaths[0]
            : null;
        setCurrentFileSharePath(() => firstFsp);
      }
    }
  }, [
    isZonesMapReady,
    zonesAndFileSharePathsMap,
    fileSharePathFavorites,
    isFileSharePathFavoritesReady,
    currentFileSharePath,
    setCurrentFileSharePath
  ]);

  React.useEffect(() => {
    const setInitialFiles = async () => {
      if (currentFileSharePath && !currentFileOrFolder) {
        await handleFileBrowserNavigation({
          fspName: currentFileSharePath.name
        });
      }
    };
    setInitialFiles();
  }, [currentFileSharePath, currentFileOrFolder, handleFileBrowserNavigation]);

  return (
    <FileBrowserContext.Provider
      value={{
        files,
        currentFileOrFolder,
        currentFileSharePath,
        setCurrentFileSharePath,
        setCurrentFileOrFolder,
        updateCurrentFileOrFolder,
        handleFileBrowserNavigation
      }}
    >
      {children}
    </FileBrowserContext.Provider>
  );
};
