import React from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';

import type { FileSharePath, FileOrFolder, Result } from '@/shared.types';
import { makeBrowseLink, makeMapKey } from '@/utils';
import { createSuccess, handleError } from '@/utils/errorHandling';
import useFileQuery, { fileQueryKeys } from '@/queries/fileQueries';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';

type FileBrowserContextProviderProps = {
  readonly children: React.ReactNode;
  readonly fspName: string | undefined;
  readonly filePath: string | undefined;
};

// Client-only state (UI state that's not fetched from server)
interface FileBrowserState {
  uiFileSharePath: FileSharePath | null;
  propertiesTarget: FileOrFolder | null;
  selectedFiles: FileOrFolder[];
}

type FileBrowserContextType = {
  // Client state (UI-only)
  fileBrowserState: FileBrowserState;

  // URL params
  fspName: string | undefined;
  filePath: string | undefined;

  // Server state query (single source of truth)
  fileQuery: ReturnType<typeof useFileQuery>;

  // Actions
  refreshFiles: () => Promise<Result<void>>;
  handleLeftClick: (
    file: FileOrFolder,
    showFilePropertiesDrawer: boolean
  ) => void;
  updateFilesWithContextMenuClick: (file: FileOrFolder) => void;
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
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  // Client-only state for UI interactions
  const [fileBrowserState, setFileBrowserState] =
    React.useState<FileBrowserState>({
      uiFileSharePath: null,
      propertiesTarget: null,
      selectedFiles: []
    });

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch file data using Tanstack Query (includes 403 fallback handling)
  const fileQuery = useFileQuery(fspName, filePath || '.');

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

  const handleLeftClick = (
    file: FileOrFolder,
    showFilePropertiesDrawer: boolean
  ) => {
    // If clicking on a file (not directory), navigate to the file URL
    if (!file.is_dir && fileBrowserState.uiFileSharePath) {
      const fileLink = makeBrowseLink(
        fileBrowserState.uiFileSharePath.name,
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

    updateFileBrowserState({
      propertiesTarget: newPropertiesTarget,
      selectedFiles: newSelectedFiles
    });
  };

  const updateFilesWithContextMenuClick = (file: FileOrFolder) => {
    const currentIndex = fileBrowserState.selectedFiles.indexOf(file);
    const newSelectedFiles =
      currentIndex === -1 ? [file] : [...fileBrowserState.selectedFiles];

    updateFileBrowserState({
      propertiesTarget: file,
      selectedFiles: newSelectedFiles
    });
  };

  // Function to refresh files for the current FSP and current file or folder
  const refreshFiles = async (): Promise<Result<void>> => {
    if (!fspName || !filePath) {
      return handleError(
        new Error('File share path and file/folder required to refresh')
      );
    }
    try {
      await queryClient.invalidateQueries({
        queryKey: fileQueryKeys.filePath(fspName, filePath)
      });
      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    }
  };

  // Update client state when URL changes (navigation to different file/folder)
  // Set propertiesTarget to the current directory/file being viewed
  React.useEffect(() => {
    const fspKey = fspName ? makeMapKey('fsp', fspName) : null;
    const newFileSharePathTarget =
      zonesAndFspQuery.data && fspKey
        ? (zonesAndFspQuery.data[fspKey] as FileSharePath)
        : null;
    setFileBrowserState({
      uiFileSharePath: newFileSharePathTarget,
      propertiesTarget: fileQuery.data?.currentFileOrFolder || null,
      selectedFiles: []
    });
  }, [
    fspName,
    filePath,
    zonesAndFspQuery?.data,
    fileQuery.data?.currentFileOrFolder
  ]);

  return (
    <FileBrowserContext.Provider
      value={{
        // Client state
        fileBrowserState,

        // URL params
        fspName,
        filePath,

        // Server state query
        fileQuery,

        // Actions
        refreshFiles,
        handleLeftClick,
        updateFilesWithContextMenuClick
      }}
    >
      {children}
    </FileBrowserContext.Provider>
  );
};
