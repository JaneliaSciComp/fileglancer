import React from 'react';
import { default as log } from '@/logger';

import type { FileOrFolder, FileSharePath } from '@/shared.types';
import { getFileBrowsePath, makeMapKey, sendFetchRequest } from '@/utils';
import { useCookiesContext } from './CookiesContext';
import { useZoneAndFspMapContext } from './ZonesAndFspMapContext';
import { normalizePosixStylePath } from '@/utils/pathHandling';

type FileBrowserResponse = {
  info: FileOrFolder;
  files: FileOrFolder[];
};

type FileBrowserContextProviderProps = {
  children: React.ReactNode;
  fspName: string | undefined;
  filePath: string | undefined;
};

interface FileBrowserState {
  isFileBrowserReady: boolean;
  currentFileSharePath: FileSharePath | null;
  currentFolder: FileOrFolder | null;
  files: FileOrFolder[];
  fetchErrorMsg: string | null;
}

type FileBrowserContextType = {
  fileBrowserState: FileBrowserState;
  fspName: string | undefined;
  filePath: string | undefined;
  propertiesTarget: FileOrFolder | null;
  // The following are duplicates of the FileBrowserState, but are here for convenience until all clients are updated.
  // TODO: Remove these once all clients are updated.
  isFileBrowserReady: boolean;
  currentFileSharePath: FileSharePath | null;
  currentFolder: FileOrFolder | null;
  files: FileOrFolder[];
  fetchErrorMsg: string | null;
  // END DUPLICATES
  refreshFiles: () => Promise<void>;
  setPropertiesTarget: React.Dispatch<
    React.SetStateAction<FileOrFolder | null>
  >;
  setCurrentFileSharePath: React.Dispatch<
    React.SetStateAction<FileSharePath | null>
  >;
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

// fspName and filePath come from URL parameters, accessed in MainLayout
export const FileBrowserContextProvider = ({
  children,
  fspName,
  filePath
}: FileBrowserContextProviderProps) => {
  // Unified state that keeps a consistent view of the file browser
  const [fileBrowserState, setFileBrowserState] =
    React.useState<FileBrowserState>({
      isFileBrowserReady: false,
      currentFileSharePath: null,
      currentFolder: null,
      files: [],
      fetchErrorMsg: null
    });

  // Duplicate states for convenience until all clients are updated.
  // TODO: Remove these once all clients are updated.
  const [isFileBrowserReady, setIsFileBrowserReady] = React.useState(false);
  const [currentFileSharePath, setCurrentFileSharePath] =
    React.useState<FileSharePath | null>(null);
  const [currentFolder, setCurrentFolder] = React.useState<FileOrFolder | null>(
    null
  );
  const [files, setFiles] = React.useState<FileOrFolder[]>([]);
  const [fetchErrorMsg, setFetchErrorMsg] = React.useState<string | null>(null);

  const [propertiesTarget, setPropertiesTarget] =
    React.useState<FileOrFolder | null>(null);

  // Function to update fileBrowserState with complete, consistent data
  const updateFileBrowserState = React.useCallback(
    (newState: Partial<FileBrowserState>) => {
      log.debug('Updating fileBrowserState:', newState);
      setFileBrowserState(prev => ({
        ...prev,
        ...newState
      }));
    },
    []
  );

  // Function to update all states consistently
  const updateAllStates = React.useCallback(
    (
      ready: boolean,
      sharePath: FileSharePath | null,
      folder: FileOrFolder | null,
      fileList: FileOrFolder[],
      errorMsg: string | null
    ) => {
      // Update fileBrowserState with complete, consistent data
      updateFileBrowserState({
        isFileBrowserReady: ready,
        currentFileSharePath: sharePath,
        currentFolder: folder,
        files: fileList,
        fetchErrorMsg: errorMsg
      });

      // Update local states for individual parts
      if (ready) {
        setIsFileBrowserReady(true);
        setCurrentFileSharePath(sharePath);
        setCurrentFolder(folder);
        setFiles(fileList);
        setFetchErrorMsg(errorMsg);
      } else {
        setIsFileBrowserReady(false);
        setCurrentFileSharePath(null);
        setCurrentFolder(null);
        setFiles([]);
        setFetchErrorMsg(errorMsg);
      }
    },
    [updateFileBrowserState]
  );

  const { cookies } = useCookiesContext();
  const { zonesAndFileSharePathsMap, isZonesMapReady } =
    useZoneAndFspMapContext();

  // Function to fetch files for the current FSP and current folder
  const fetchFileInfo = React.useCallback(
    async (
      fspName: string,
      folderName: string
    ): Promise<FileBrowserResponse> => {
      const url = getFileBrowsePath(fspName, folderName);

      const response = await sendFetchRequest(url, 'GET', cookies['_xsrf']);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          if (data.info && data.info.owner) {
            throw new Error(
              `You do not have permission to list this folder. Contact the owner (${data.info.owner}) for access.`
            );
          } else {
            throw new Error(
              'You do not have permission to list this folder. Contact the owner for access.'
            );
          }
        } else if (response.status === 404) {
          throw new Error('Folder not found');
        }
      }

      return data as FileBrowserResponse;
    },
    [cookies]
  );

  // Fetch files for the given FSP and folder, and update the fileBrowserState
  const fetchAndUpdateFileBrowserState = React.useCallback(
    async (
      fsp: FileSharePath,
      folderPath: string
    ): Promise<FileOrFolder | null> => {
      log.debug('Fetching files for FSP:', fsp.name, 'and folder:', folderPath);
      let folder: FileOrFolder | null = null;
      try {
        const response = await fetchFileInfo(fsp.name, folderPath);
        folder = response.info as FileOrFolder;
        console.log('Fetched folder:', folder);
        if (folder) {
          folder = {
            ...folder,
            path: normalizePosixStylePath(folder.path)
          };
        }
        console.log('Normalized folder:', folder);

        // Normalize the file paths in POSIX style, assuming POSIX-style paths
        let files = response.files as FileOrFolder[];
        console.log('Fetched files:', files);
        if (files) {
          files = files.map(file => ({
            ...file,
            path: normalizePosixStylePath(file.path)
          }));
          console.log('Normalized files:', files);

          // Sort: directories first, then files; alphabetically within each type
          files = files.sort((a: FileOrFolder, b: FileOrFolder) => {
            if (a.is_dir === b.is_dir) {
              return a.name.localeCompare(b.name);
            }
            return a.is_dir ? -1 : 1;
          });
        }

        // Update all states consistently
        updateAllStates(true, fsp, folder, files, null);
      } catch (error) {
        log.error(error);
        if (error instanceof Error) {
          updateAllStates(true, fsp, folder, [], error.message);
        } else {
          updateAllStates(true, fsp, folder, [], 'An unknown error occurred');
        }
      }
      return folder;
    },
    [updateAllStates, fetchFileInfo]
  );

  // Function to refresh files for the current FSP and current folder
  const refreshFiles = React.useCallback(async (): Promise<void> => {
    if (
      !fileBrowserState.currentFileSharePath ||
      !fileBrowserState.currentFolder
    ) {
      return;
    }
    log.debug('Refreshing file list');
    await fetchAndUpdateFileBrowserState(
      fileBrowserState.currentFileSharePath,
      fileBrowserState.currentFolder.path
    );
  }, [
    fileBrowserState.currentFileSharePath,
    fileBrowserState.currentFolder,
    fetchAndUpdateFileBrowserState
  ]);

  // Effect to update currentFolder and propertiesTarget when URL params change
  React.useEffect(() => {
    log.debug('URL changed: fspName=', fspName, 'filePath=', filePath);
    let cancelled = false;
    const updateCurrentFileSharePathAndFolder = async () => {
      if (!isZonesMapReady || !zonesAndFileSharePathsMap || !fspName) {
        if (cancelled) {
          return;
        }
        updateAllStates(false, null, null, [], null);
        return;
      }

      const fspKey = makeMapKey('fsp', fspName);
      const urlFsp = zonesAndFileSharePathsMap[fspKey] as FileSharePath;
      if (!urlFsp) {
        log.error(`File share path not found for fspName: ${fspName}`);
        if (cancelled) {
          return;
        }
        updateAllStates(false, null, null, [], null);
        return;
      }

      const folder = await fetchAndUpdateFileBrowserState(
        urlFsp,
        filePath || '.'
      );
      if (cancelled) {
        return;
      }
      setPropertiesTarget(folder);
    };
    updateCurrentFileSharePathAndFolder();
    return () => {
      // Cleanup function to prevent state updates if a dependency changes
      // in an asynchronous operation
      cancelled = true;
    };
  }, [
    isZonesMapReady,
    zonesAndFileSharePathsMap,
    fspName,
    filePath,
    updateAllStates,
    fetchAndUpdateFileBrowserState
  ]);

  return (
    <FileBrowserContext.Provider
      value={{
        fileBrowserState,
        isFileBrowserReady,
        fspName,
        filePath,
        files,
        currentFolder,
        currentFileSharePath,
        fetchErrorMsg,
        refreshFiles,
        propertiesTarget,
        setPropertiesTarget,
        setCurrentFileSharePath
      }}
    >
      {children}
    </FileBrowserContext.Provider>
  );
};
