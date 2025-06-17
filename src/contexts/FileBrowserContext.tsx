import React from 'react';

import { FileOrFolder, FileSharePath, TryCatchResult } from '@/shared.types';
import { getFileBrowsePath, tryCatchWrapper, sendFetchRequest } from '@/utils';
import { useCookiesContext } from './CookiesContext';
// import { useZoneAndFspMapContext } from './ZonesAndFspMapContext';
// import { usePreferencesContext } from './PreferencesContext';

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
  }) => Promise<TryCatchResult>;
  handleFileBrowserNavigation: (args: {
    fspName?: string;
    path?: string;
  }) => Promise<TryCatchResult>;
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
  // const { zonesAndFileSharePathsMap, isZonesMapReady } =
  //   useZoneAndFspMapContext();
  // const { fileSharePathFavorites, isFileSharePathFavoritesReady } =
  //   usePreferencesContext();

  const updateCurrentFileOrFolder = React.useCallback(
    async ({ fspName, path }: { fspName: string; path?: string }) => {
      const url = getFileBrowsePath(fspName, path);
      return tryCatchWrapper('Update current file or folder', async () => {
        const response = await sendFetchRequest(url, 'GET', cookies['_xsrf']);
        const data = await response.json();
        if (data) {
          setCurrentFileOrFolder(data['info'] as FileOrFolder);
        }
        return { success: true };
      });
    },
    [cookies]
  );

  const fetchAndFormatFilesForDisplay = React.useCallback(
    async ({ fspName, path }: { fspName: string; path?: string }) => {
      const url = path
        ? getFileBrowsePath(fspName, path)
        : getFileBrowsePath(fspName);

      let data = [];
      return tryCatchWrapper('Send fetch request', async () => {
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
      });
    },
    [cookies]
  );

  const handleFileBrowserNavigation = React.useCallback(
    async ({ fspName, path }: { fspName?: string; path?: string }) => {
      const fetchPathFsp = fspName || currentFileSharePath?.name;
      if (!fetchPathFsp) {
        setCurrentFileOrFolder(null);
        setCurrentFileSharePath(null);
        setFiles([]);
        return { success: false, error: 'No file share path specified' };
      }
      return tryCatchWrapper('File browser navigation', async () => {
        const fetchFilesResult = await fetchAndFormatFilesForDisplay({
          fspName: fetchPathFsp as string,
          ...(path && { path })
        });
        // if fetchFilesResult is not successful, return early
        if (!fetchFilesResult.success) {
          return fetchFilesResult;
        }

        if (!currentFileOrFolder || currentFileOrFolder.path !== path) {
          const updateResult = await updateCurrentFileOrFolder({
            fspName: fetchPathFsp as string,
            ...(path && { path })
          });
          // if updateResult is not successful, return early
          if (!updateResult.success) {
            return updateResult;
          }
        }
      });
    },
    [
      currentFileSharePath,
      fetchAndFormatFilesForDisplay,
      updateCurrentFileOrFolder,
      currentFileOrFolder
    ]
  );

  // React.useEffect(() => {
  //   // Only run if zones are ready and fileSharePathFavorites have been loaded (not undefined)
  //   if (!isZonesMapReady || !isFileSharePathFavoritesReady) {
  //     return;
  //   }

  //   // Only set if currentFileSharePath is not set
  //   if (!currentFileSharePath) {
  //     if (fileSharePathFavorites.length > 0) {
  //       setCurrentFileSharePath(() => fileSharePathFavorites[0]);
  //     }
  //   }
  // }, [
  //   isZonesMapReady,
  //   zonesAndFileSharePathsMap,
  //   fileSharePathFavorites,
  //   isFileSharePathFavoritesReady,
  //   currentFileSharePath,
  //   setCurrentFileSharePath
  // ]);

  // React.useEffect(() => {
  //   const setInitialFiles = async () => {
  //     if (currentFileSharePath && !currentFileOrFolder) {
  //       await handleFileBrowserNavigation({
  //         fspName: currentFileSharePath.name
  //       });
  //     }
  //   };
  //   setInitialFiles();
  // }, [currentFileSharePath, currentFileOrFolder, handleFileBrowserNavigation]);

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
