import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo
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

// Public state - what consumers see
type FileBrowserState = {
  propertiesTarget: FileOrFolder | null;
  selectedFiles: FileOrFolder[];
};

// Internal state
type InternalFileBrowserState = {
  propertiesTargetPath: string | null; // Store path instead of full object
  selectedFiles: FileOrFolder[];
};

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

  // Internal state for UI interactions
  const [internalState, setInternalState] = useState<InternalFileBrowserState>({
    propertiesTargetPath: null,
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

  // Helper to update internal state
  const updateInternalState = useCallback(
    (newState: Partial<InternalFileBrowserState>) => {
      setInternalState(prev => ({
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
    const isBrokenSymlink = file.is_symlink && !file.symlink_target_fsp;
    // If clicking on a file (not directory), navigate to the file URL
    if (
      !file.is_dir &&
      fileQuery.data?.currentFileSharePath &&
      !isBrokenSymlink
    ) {
      const fileLink = makeBrowseLink(
        fileQuery.data?.currentFileSharePath.name,
        file.path
      );
      navigate(fileLink);
      return;
    }

    // Select the clicked file
    const currentIndex = internalState.selectedFiles.indexOf(file);
    const newSelectedFiles =
      currentIndex === -1 ||
      internalState.selectedFiles.length > 1 ||
      showFilePropertiesDrawer
        ? [file]
        : [];
    const newPropertiesTargetPath =
      currentIndex === -1 ||
      internalState.selectedFiles.length > 1 ||
      showFilePropertiesDrawer
        ? file.path
        : null;

    updateInternalState({
      propertiesTargetPath: newPropertiesTargetPath,
      selectedFiles: newSelectedFiles
    });
  };

  const updateFilesWithContextMenuClick = (file: FileOrFolder) => {
    const currentIndex = internalState.selectedFiles.indexOf(file);
    const newSelectedFiles =
      currentIndex === -1 ? [file] : [...internalState.selectedFiles];

    updateInternalState({
      propertiesTargetPath: file.path,
      selectedFiles: newSelectedFiles
    });
  };

  // Update client state when URL changes (navigation to different file/folder)
  // Set propertiesTarget to the current directory/file being viewed
  useEffect(
    () => {
      if (fileQuery.isLoading || fileQuery.isError) {
        return;
      } else {
        setInternalState({
          propertiesTargetPath:
            fileQuery.data?.currentFileOrFolder?.path || null,
          selectedFiles: []
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      fspName,
      filePath,
      zonesAndFspQuery?.data,
      fileQuery.isLoading,
      fileQuery.isError
      // Deliberately NOT including fileQuery.data?.currentFileOrFolder
      // so this only runs on URL changes, not query refetches
    ]
  );

  // Update propertiesTargetPath when a file is renamed
  // This runs when the mutation succeeds, updating propertiesTargetPath
  // so useMemo can find the file with the new path after the query refetches
  useEffect(() => {
    if (renameMutation.isSuccess && renameMutation.variables) {
      const { oldPath, newPath } = renameMutation.variables;

      // If the renamed file was the propertiesTarget, update to the new path
      if (internalState.propertiesTargetPath === oldPath) {
        setInternalState(prev => ({
          ...prev,
          propertiesTargetPath: newPath
        }));
      }
      // Reset mutation state to prevent re-running
      renameMutation.reset();
    }
  }, [
    renameMutation.isSuccess,
    renameMutation.variables,
    internalState.propertiesTargetPath,
    renameMutation
  ]);

  // Derive propertiesTarget from propertiesTargetPath and fresh query data
  // This ensures mutations (rename, permissions) are correctly reflected and don't use a useEffect
  const propertiesTarget = useMemo(() => {
    if (!internalState.propertiesTargetPath || !fileQuery.data) {
      return null;
    }

    // Check if propertiesTargetPath matches the current folder
    if (
      fileQuery.data.currentFileOrFolder?.path ===
      internalState.propertiesTargetPath
    ) {
      return fileQuery.data.currentFileOrFolder;
    }

    // Otherwise, is it a child of current folder
    const foundFile = fileQuery.data.files.find(
      f => f.path === internalState.propertiesTargetPath
    );

    return foundFile || null;
  }, [internalState.propertiesTargetPath, fileQuery.data]);

  return (
    <FileBrowserContext.Provider
      value={{
        fileBrowserState: {
          propertiesTarget,
          selectedFiles: internalState.selectedFiles
        },

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
