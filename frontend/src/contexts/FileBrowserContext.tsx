import React from 'react';
import { useNavigate } from 'react-router';
import { default as log } from '@/logger';

import type { FileOrFolder, FileSharePath, Result } from '@/shared.types';
import {
  getFileBrowsePath,
  makeMapKey,
  sendFetchRequest,
  makeBrowseLink
} from '@/utils';
import { useCookiesContext } from './CookiesContext';
import { useZoneAndFspMapContext } from './ZonesAndFspMapContext';
import { normalizePosixStylePath } from '@/utils/pathHandling';
import { createSuccess, handleError } from '@/utils/errorHandling';

type FileBrowserResponse = {
  info: FileOrFolder;
  files: FileOrFolder[];
};

type FileBrowserContextProviderProps = {
  readonly children: React.ReactNode;
  readonly fspName: string | undefined;
  readonly filePath: string | undefined;
};

interface FileBrowserState {
  currentFileSharePath: FileSharePath | null;
  currentFileOrFolder: FileOrFolder | null;
  files: FileOrFolder[];
  propertiesTarget: FileOrFolder | null;
  selectedFiles: FileOrFolder[];
  uiErrorMsg: string | null;
  fileContentRefreshTrigger: number;
}

type FileBrowserContextType = {
  fileBrowserState: FileBrowserState;
  fspName: string | undefined;
  filePath: string | undefined;

  areFileDataLoading: boolean;
  refreshFiles: () => Promise<Result<void>>;
  triggerFileContentRefresh: () => void;
  handleLeftClick: (
    file: FileOrFolder,
    showFilePropertiesDrawer: boolean
  ) => void;
  updateFilesWithContextMenuClick: (file: FileOrFolder) => void;
  setCurrentFileSharePath: (sharePath: FileSharePath | null) => void;
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
      currentFileSharePath: null,
      currentFileOrFolder: null,
      files: [],
      propertiesTarget: null,
      selectedFiles: [],
      uiErrorMsg: null,
      fileContentRefreshTrigger: 0
    });
  const [areFileDataLoading, setAreFileDataLoading] = React.useState(false);

  // Function to update fileBrowserState with complete, consistent data
  const updateFileBrowserState = React.useCallback(
    (newState: Partial<FileBrowserState>) => {
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
      sharePath: FileSharePath | null,
      fileOrFolder: FileOrFolder | null,
      fileList: FileOrFolder[],
      targetItem: FileOrFolder | null,
      selectedItems: FileOrFolder[] = [],
      msg: string | null
    ) => {
      // Update fileBrowserState with complete, consistent data
      updateFileBrowserState({
        currentFileSharePath: sharePath,
        currentFileOrFolder: fileOrFolder,
        files: fileList,
        propertiesTarget: targetItem,
        selectedFiles: selectedItems,
        uiErrorMsg: msg
      });
    },
    [updateFileBrowserState]
  );

  const setCurrentFileSharePath = React.useCallback(
    (sharePath: FileSharePath | null) => {
      updateFileBrowserState({
        currentFileSharePath: sharePath
      });
    },
    [updateFileBrowserState]
  );

  const { cookies } = useCookiesContext();
  const { zonesAndFileSharePathsMap, isZonesMapReady } =
    useZoneAndFspMapContext();
  const navigate = useNavigate();

  const handleLeftClick = (
    file: FileOrFolder,
    showFilePropertiesDrawer: boolean
  ) => {
    // If clicking on a file (not directory), navigate to the file URL
    if (!file.is_dir && fileBrowserState.currentFileSharePath) {
      const fileLink = makeBrowseLink(
        fileBrowserState.currentFileSharePath.name,
        file.path
      );
      navigate(fileLink);
      return;
    }

    // Select the clicked file
    const currentIndex = fileBrowserState.selectedFiles.indexOf(file);
    const newSelectedFiles =
      currentIndex === -1 ||
      fileBrowserState.selectedFiles.length > 1 ||
      showFilePropertiesDrawer
        ? [file]
        : [];
    const newPropertiesTarget =
      currentIndex === -1 ||
      fileBrowserState.selectedFiles.length > 1 ||
      showFilePropertiesDrawer
        ? file
        : null;

    updateAllStates(
      fileBrowserState.currentFileSharePath,
      fileBrowserState.currentFileOrFolder,
      fileBrowserState.files,
      newPropertiesTarget,
      newSelectedFiles,
      fileBrowserState.uiErrorMsg
    );
  };

  const updateFilesWithContextMenuClick = (file: FileOrFolder) => {
    const currentIndex = fileBrowserState.selectedFiles.indexOf(file);
    const newSelectedFiles =
      currentIndex === -1 ? [file] : [...fileBrowserState.selectedFiles];

    updateAllStates(
      fileBrowserState.currentFileSharePath,
      fileBrowserState.currentFileOrFolder,
      fileBrowserState.files,
      file, // Set as properties target
      newSelectedFiles,
      fileBrowserState.uiErrorMsg
    );
  };

  // Function to fetch files for the current FSP and current folder
  const fetchFileInfo = React.useCallback(
    async (
      fspName: string,
      folderName: string
    ): Promise<FileBrowserResponse> => {
      const url = getFileBrowsePath(fspName, folderName);

      const response = await sendFetchRequest(url, 'GET', cookies['_xsrf']);
      const body = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          const errorMessage =
            body.info && body.info.owner
              ? `You do not have permission to list this folder. Contact the owner (${body.info.owner}) for access.`
              : 'You do not have permission to list this folder. Contact the owner for access.';

          // Create custom error with additional info for fallback object
          const error = new Error(errorMessage) as Error & { info?: any };
          error.info = body.info;
          throw error;
        } else if (response.status === 404) {
          throw new Error('Folder not found');
        } else {
          throw new Error(
            body.error ? body.error : `Unknown error (${response.status})`
          );
        }
      }

      return body as FileBrowserResponse;
    },
    [cookies]
  );

  // Fetch metadata for the given FSP and path, and update the fileBrowserState
  const fetchAndUpdateFileBrowserState = React.useCallback(
    async (fsp: FileSharePath, targetPath: string): Promise<void> => {
      setAreFileDataLoading(true);
      let fileOrFolder: FileOrFolder | null = null;

      try {
        // Fetch the metadata for the target path
        const response = await fetchFileInfo(fsp.name, targetPath);
        fileOrFolder = response.info as FileOrFolder;

        if (fileOrFolder) {
          fileOrFolder = {
            ...fileOrFolder,
            path: normalizePosixStylePath(fileOrFolder.path)
          };
        }

        // Normalize the file paths in POSIX style, assuming POSIX-style paths
        // For files, response.files will be empty array or undefined
        let files = (response.files || []).map(file => ({
          ...file,
          path: normalizePosixStylePath(file.path)
        })) as FileOrFolder[];

        // Sort: directories first, then files; alphabetically within each type
        files = files.sort((a: FileOrFolder, b: FileOrFolder) => {
          if (a.is_dir === b.is_dir) {
            return a.name.localeCompare(b.name);
          }
          return a.is_dir ? -1 : 1;
        });

        // Update all states consistently
        // If it's a file, it becomes both the current item and the properties target
        const propertiesTarget = fileOrFolder;
        const selectedFiles = fileOrFolder ? [fileOrFolder] : [];

        updateAllStates(
          fsp,
          fileOrFolder,
          files,
          propertiesTarget,
          selectedFiles,
          null
        );
      } catch (error) {
        log.error(error);

        // Check if error contains body.info from 403 response
        const errorWithInfo = error as Error & { info?: any };
        const bodyInfo = errorWithInfo.info;

        // Create a minimal FileOrFolder object with the target path information
        // Use body.info if available from 403 response, otherwise use fallback values
        const fallbackFileOrFolder: FileOrFolder = {
          name:
            bodyInfo?.name ||
            (targetPath === '.' ? '' : targetPath.split('/').pop() || ''),
          path: normalizePosixStylePath(bodyInfo?.path || targetPath),
          is_dir: bodyInfo?.is_dir ?? true,
          size: bodyInfo?.size || 0,
          last_modified: bodyInfo?.last_modified || 0,
          owner: bodyInfo?.owner || '',
          group: bodyInfo?.group || '',
          hasRead: bodyInfo?.hasRead || false,
          hasWrite: bodyInfo?.haswrite || false,
          permissions: bodyInfo?.permissions || ''
        };

        const errorMessage =
          error instanceof Error ? error.message : 'An unknown error occurred';

        updateAllStates(
          fsp,
          fallbackFileOrFolder,
          [],
          fallbackFileOrFolder,
          [],
          errorMessage
        );
      } finally {
        setAreFileDataLoading(false);
      }
    },
    [updateAllStates, fetchFileInfo]
  );

  // Function to refresh files for the current FSP and current file or folder
  const refreshFiles = async (): Promise<Result<void>> => {
    if (
      !fileBrowserState.currentFileSharePath ||
      !fileBrowserState.currentFileOrFolder
    ) {
      return handleError(
        new Error('File share path and file/folder required to refresh')
      );
    }
    try {
      await fetchAndUpdateFileBrowserState(
        fileBrowserState.currentFileSharePath,
        fileBrowserState.currentFileOrFolder.path
      );
      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    }
  };

  // Function to trigger a refresh of file content in FileViewer
  const triggerFileContentRefresh = React.useCallback(() => {
    setFileBrowserState(prev => ({
      ...prev,
      fileContentRefreshTrigger: prev.fileContentRefreshTrigger + 1
    }));
  }, []);

  // Effect to update currentFolder and propertiesTarget when URL params change
  React.useEffect(() => {
    let cancelled = false;
    const updateCurrentFileSharePathAndFolder = async () => {
      if (!isZonesMapReady || !zonesAndFileSharePathsMap) {
        return;
      }
      if (!fspName) {
        if (cancelled) {
          return;
        }
        updateAllStates(
          null,
          null,
          [],
          null,
          [],
          'No file share path name in URL'
        );
        return;
      }

      const fspKey = makeMapKey('fsp', fspName);
      const urlFsp = zonesAndFileSharePathsMap[fspKey] as FileSharePath;
      if (!urlFsp) {
        if (cancelled) {
          return;
        }
        updateAllStates(
          null,
          null,
          [],
          null,
          [],
          'Invalid file share path name'
        );
        return;
      }

      await fetchAndUpdateFileBrowserState(urlFsp, filePath || '.');

      if (cancelled) {
        return;
      }
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
        fspName,
        filePath,
        refreshFiles,
        triggerFileContentRefresh,
        handleLeftClick,
        updateFilesWithContextMenuClick,
        areFileDataLoading,
        setCurrentFileSharePath
      }}
    >
      {children}
    </FileBrowserContext.Provider>
  );
};
