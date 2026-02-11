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
  dataLinkPath: string | null;
};

// Internal state
type InternalFileBrowserState = {
  propertiesTargetPath: string | null; // Store path instead of full object
  propertiesTargetName: string | null; // Store name for unique lookup in file listings
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
    propertiesTargetName: null,
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
    // If clicking on a regular file (not directory or symlink), navigate to the file URL
    if (
      !file.is_dir &&
      !file.is_symlink &&
      fileQuery.data?.currentFileSharePath
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
    const isSelected =
      currentIndex === -1 ||
      internalState.selectedFiles.length > 1 ||
      showFilePropertiesDrawer;

    updateInternalState({
      propertiesTargetPath: isSelected ? file.path : null,
      propertiesTargetName: isSelected ? file.name : null,
      selectedFiles: newSelectedFiles
    });
  };

  const updateFilesWithContextMenuClick = (file: FileOrFolder) => {
    const currentIndex = internalState.selectedFiles.indexOf(file);
    const newSelectedFiles =
      currentIndex === -1 ? [file] : [...internalState.selectedFiles];

    updateInternalState({
      propertiesTargetPath: file.path,
      propertiesTargetName: file.name,
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
          propertiesTargetName: null,
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

      // If the renamed file was the propertiesTarget, update to the new path/name
      if (internalState.propertiesTargetPath === oldPath) {
        const newName = newPath.includes('/')
          ? newPath.split('/').pop()!
          : newPath;
        setInternalState(prev => ({
          ...prev,
          propertiesTargetPath: newPath,
          propertiesTargetName: newName
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

  // Derive propertiesTarget from propertiesTargetPath/Name and fresh query data
  // This ensures mutations (rename, permissions) are correctly reflected and don't use a useEffect
  const propertiesTarget = useMemo(() => {
    if (!internalState.propertiesTargetPath || !fileQuery.data) {
      return null;
    }

    // Check if propertiesTargetPath matches the current folder (navigation case)
    if (
      fileQuery.data.currentFileOrFolder?.path ===
      internalState.propertiesTargetPath
    ) {
      return fileQuery.data.currentFileOrFolder;
    }

    // Find child by name when available (click selection case).
    // Name is unique within a directory and avoids ambiguity from symlinks
    // whose resolved path may collide with their target's path.
    if (internalState.propertiesTargetName) {
      const foundFile = fileQuery.data.files.find(
        f => f.name === internalState.propertiesTargetName
      );
      if (foundFile) {
        return foundFile;
      }
    }

    // Fallback: find by path
    const foundFile = fileQuery.data.files.find(
      f => f.path === internalState.propertiesTargetPath
    );

    return foundFile || null;
  }, [
    internalState.propertiesTargetPath,
    internalState.propertiesTargetName,
    fileQuery.data
  ]);

  // Compute the effective path for data link operations.
  // For symlinks, construct the unresolved path from parent + symlink name
  // (propertiesTarget.path is the resolved target path, not the symlink location).
  // For non-symlinks, use propertiesTarget.path directly.
  const dataLinkPath = useMemo(() => {
    const parentPath = fileQuery.data?.currentFileOrFolder?.path;
    if (!propertiesTarget) {
      return parentPath || null;
    }
    if (propertiesTarget.is_symlink && propertiesTarget.name && parentPath) {
      return parentPath === '.'
        ? propertiesTarget.name
        : `${parentPath}/${propertiesTarget.name}`;
    }
    return propertiesTarget.path;
  }, [propertiesTarget, fileQuery.data?.currentFileOrFolder?.path]);

  return (
    <FileBrowserContext.Provider
      value={{
        fileBrowserState: {
          propertiesTarget,
          selectedFiles: internalState.selectedFiles,
          dataLinkPath
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
