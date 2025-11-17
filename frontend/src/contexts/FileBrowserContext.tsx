import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect
} from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { UseMutationResult } from '@tanstack/react-query';

import type { FileOrFolder } from '@/shared.types';
import { makeBrowseLink } from '@/utils';
import useFileQuery, {
  useDeleteFileMutation,
  useCreateFolderMutation,
  useRenameFileMutation,
  useChangePermissionsMutation
} from '@/queries/fileQueries';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';

type FileBrowserContextProviderProps = {
  readonly children: ReactNode;
  readonly fspName: string | undefined;
  readonly filePath: string | undefined;
};

// Client-only state (UI state that's not fetched from server)
interface FileBrowserState {
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

  // File operation mutations
  mutations: {
    delete: UseMutationResult<
      void,
      Error,
      { fspName: string; filePath: string }
    >;
    createFolder: UseMutationResult<
      void,
      Error,
      { fspName: string; folderPath: string }
    >;
    rename: UseMutationResult<
      void,
      Error,
      { fspName: string; oldPath: string; newPath: string }
    >;
    changePermissions: UseMutationResult<
      void,
      Error,
      { fspName: string; filePath: string; permissions: string }
    >;
  };

  // Actions
  handleLeftClick: (
    file: FileOrFolder,
    showFilePropertiesDrawer: boolean
  ) => void;
  updateFilesWithContextMenuClick: (file: FileOrFolder) => void;
};

const FileBrowserContext = createContext<FileBrowserContextType | null>(null);

export const useFileBrowserContext = () => {
  const context = useContext(FileBrowserContext);
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
  const [fileBrowserState, setFileBrowserState] = useState<FileBrowserState>({
    propertiesTarget: null,
    selectedFiles: []
  });

  const navigate = useNavigate();

  // Fetch file data using Tanstack Query (includes 403 fallback handling)
  const fileQuery = useFileQuery(fspName, filePath || '.');

  // File operation mutations
  const deleteMutation = useDeleteFileMutation();
  const createFolderMutation = useCreateFolderMutation();
  const renameMutation = useRenameFileMutation();
  const changePermissionsMutation = useChangePermissionsMutation();

  // Function to update fileBrowserState with complete, consistent data
  const updateFileBrowserState = useCallback(
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
    if (!file.is_dir && fileQuery.data?.currentFileSharePath) {
      const fileLink = makeBrowseLink(
        fileQuery.data?.currentFileSharePath.name,
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

  // Update client state when URL changes (navigation to different file/folder)
  // Set propertiesTarget to the current directory/file being viewed
  useEffect(() => {
    setFileBrowserState({
      propertiesTarget: fileQuery.data?.currentFileOrFolder || null,
      selectedFiles: []
    });
  }, [
    fspName,
    filePath,
    zonesAndFspQuery?.data,
    fileQuery.data?.currentFileOrFolder
  ]);

  // Update propertiesTarget when the selected file's data changes in the query cache
  // This ensures optimistic updates to permissions are reflected in the properties drawer
  // which reads from propertiesTarget, not currentFileOrFolder directly
  useEffect(() => {
    if (
      !fileBrowserState.propertiesTarget ||
      !fileQuery.data?.currentFileOrFolder
    ) {
      return;
    }

    // If we have a propertiesTarget selected, check if its data has been updated in the query
    const updatedFile = fileQuery.data.files.find(
      f => f.path === fileBrowserState.propertiesTarget?.path
    );

    // If the file exists in the files array and has been updated, update propertiesTarget
    if (updatedFile) {
      setFileBrowserState(prev => ({
        ...prev,
        propertiesTarget: updatedFile
      }));
    }
    // If propertiesTarget is the current folder itself, update it from currentFileOrFolder
    else if (
      fileBrowserState.propertiesTarget.path ===
      fileQuery.data.currentFileOrFolder.path
    ) {
      setFileBrowserState(prev => ({
        ...prev,
        propertiesTarget: fileQuery.data.currentFileOrFolder
      }));
    }
  }, [fileQuery.data, fileBrowserState.propertiesTarget]);

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

        // File operation mutations
        mutations: {
          delete: deleteMutation,
          createFolder: createFolderMutation,
          rename: renameMutation,
          changePermissions: changePermissionsMutation
        },

        // Actions
        handleLeftClick,
        updateFilesWithContextMenuClick
      }}
    >
      {children}
    </FileBrowserContext.Provider>
  );
};
