import React from 'react';
import {
  useQuery,
  UseQueryResult,
  useMutation,
  UseMutationResult,
  useQueryClient,
  QueryFunctionContext
} from '@tanstack/react-query';

import { FetchError } from './queryUtils';
import { sendFetchRequest, getFileBrowsePath, makeMapKey } from '@/utils';
import { normalizePosixStylePath } from '@/utils/pathHandling';
import type { FileOrFolder, FileSharePath } from '@/shared.types';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';

type FileBrowserResponse = {
  info: FileOrFolder;
  files: FileOrFolder[];
};

type FileQueryData = {
  currentFileSharePath: FileSharePath | null;
  currentFileOrFolder: FileOrFolder | null;
  files: FileOrFolder[];
  errorMessage?: string; // For permission errors that should be displayed but not thrown
};

// Query key factory for hierarchical cache management
export const fileQueryKeys = {
  all: ['files'] as const,
  fspName: (fspName: string) => [...fileQueryKeys.all, fspName] as const,
  filePath: (fspName: string, filePath: string) =>
    [...fileQueryKeys.fspName(fspName), filePath] as const
};

export default function useFileQuery(
  fspName: string | undefined,
  folderName: string
): UseQueryResult<FileQueryData, Error> {
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  // Function to fetch files for the current FSP and current folder
  const fetchFileInfo = async ({
    signal
  }: QueryFunctionContext): Promise<
    FileBrowserResponse & { errorMessage?: string }
  > => {
    if (!fspName) {
      throw new Error('No file share path selected');
    }

    const url = getFileBrowsePath(fspName, folderName);

    const response = await sendFetchRequest(url, 'GET', undefined, { signal });
    const body = await response.json();

    if (response.ok) {
      return body as FileBrowserResponse;
    }

    // Handle error responses
    if (response.status === 403) {
      const errorMessage =
        body.info && body.info.owner
          ? `You do not have permission to list this folder. Contact the owner (${body.info.owner}) for access.`
          : 'You do not have permission to list this folder. Contact the owner for access.';

      // Return partial data with error message instead of throwing
      // This allows the UI to display both the folder info AND the error message
      return {
        info: body.info || {
          name: folderName === '.' ? '' : folderName.split('/').pop() || '',
          path: folderName || '.',
          is_dir: true,
          size: 0,
          last_modified: 0,
          owner: '',
          group: '',
          hasRead: false,
          hasWrite: false,
          permissions: ''
        },
        files: [], // No files accessible due to permission error
        errorMessage
      };
    } else if (response.status === 404) {
      throw new Error('Folder not found');
    } else {
      throw new Error(
        body.error ? body.error : `Unknown error (${response.status})`
      );
    }
  };

  const transformData = React.useCallback(
    (
      data: (FileBrowserResponse | { info: FileOrFolder }) & {
        errorMessage?: string;
      }
    ): FileQueryData => {
      // This should never happen because query is disabled when !fspName
      if (!fspName) {
        throw new Error('fspName is required for transforming file query data');
      }

      const fspKey = makeMapKey('fsp', fspName);
      const currentFileSharePath =
        (zonesAndFspQuery.data?.[fspKey] as FileSharePath) || null;

      // Normalize the path in the current file or folder
      let currentFileOrFolder: FileOrFolder | null = data.info;
      if (currentFileOrFolder) {
        currentFileOrFolder = {
          ...currentFileOrFolder,
          path: normalizePosixStylePath(currentFileOrFolder.path)
        };
      }

      // Normalize file paths and sort: directories first, then alphabetically
      // Handle partial data case (403 error with only info, no files)
      const rawFiles = 'files' in data ? data.files : [];
      let files = (rawFiles || []).map(file => ({
        ...file,
        path: normalizePosixStylePath(file.path)
      })) as FileOrFolder[];

      files = files.sort((a: FileOrFolder, b: FileOrFolder) => {
        if (a.is_dir === b.is_dir) {
          return a.name.localeCompare(b.name);
        }
        return a.is_dir ? -1 : 1;
      });

      return {
        currentFileSharePath,
        currentFileOrFolder,
        files,
        errorMessage: data.errorMessage
      };
    },
    [fspName, zonesAndFspQuery.data]
  );

  return useQuery<
    FileBrowserResponse & { errorMessage?: string },
    Error,
    FileQueryData
  >({
    queryKey: fileQueryKeys.filePath(fspName || '', folderName),
    queryFn: fetchFileInfo,
    select: transformData,
    enabled: !!fspName && !!zonesAndFspQuery.data,
    staleTime: 5 * 60 * 1000 // 5 minutes - file listings don't change that often
  });
}

// Mutation Hooks

// Mutation key factory
export const fileMutationKeys = {
  delete: (fspName: string, filePath: string) =>
    ['files', 'delete', fspName, filePath] as const,
  create: (fspName: string, filePath: string) =>
    ['files', 'create', fspName, filePath] as const,
  rename: (fspName: string, filePath: string) =>
    ['files', 'rename', fspName, filePath] as const,
  permissions: (fspName: string, filePath: string) =>
    ['files', 'permissions', fspName, filePath] as const
};

type DeleteFileParams = {
  fspName: string;
  filePath: string;
  signal?: AbortSignal;
};

async function deleteFile({
  fspName,
  filePath,
  signal
}: DeleteFileParams): Promise<void> {
  const url = getFileBrowsePath(fspName, filePath);
  const response = await sendFetchRequest(url, 'DELETE', undefined, { signal });

  if (!response.ok) {
    if (response.status === 403) {
      throw new FetchError(response, 'Permission denied');
    }
    const body = await response.json().catch(() => ({}));
    const errorMessage =
      body.error || `Failed to delete file (${response.status})`;
    throw new FetchError(response, errorMessage);
  }
}

export function useDeleteFileMutation(): UseMutationResult<
  void,
  Error,
  DeleteFileParams
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteFile,
    onSuccess: (_, variables) => {
      // Invalidate the parent directory's file list
      queryClient.invalidateQueries({
        queryKey: fileQueryKeys.fspName(variables.fspName)
      });
    }
  });
}

type CreateFolderParams = {
  fspName: string;
  folderPath: string;
  signal?: AbortSignal;
};

async function createFolder({
  fspName,
  folderPath,
  signal
}: CreateFolderParams): Promise<void> {
  const url = getFileBrowsePath(fspName, folderPath);
  const response = await sendFetchRequest(
    url,
    'POST',
    {
      type: 'directory'
    },
    { signal }
  );

  if (!response.ok) {
    if (response.status === 403) {
      throw new FetchError(response, 'Permission denied');
    }
    const body = await response.json().catch(() => ({}));
    const errorMessage =
      body.error || `Failed to create folder (${response.status})`;
    throw new FetchError(response, errorMessage);
  }
}

export function useCreateFolderMutation(): UseMutationResult<
  void,
  Error,
  CreateFolderParams
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createFolder,
    onSuccess: (_, variables) => {
      // Invalidate the parent directory's file list
      queryClient.invalidateQueries({
        queryKey: fileQueryKeys.fspName(variables.fspName)
      });
    }
  });
}

type RenameFileParams = {
  fspName: string;
  oldPath: string;
  newPath: string;
  signal?: AbortSignal;
};

async function renameFile({
  fspName,
  oldPath,
  newPath,
  signal
}: RenameFileParams): Promise<void> {
  const url = getFileBrowsePath(fspName, oldPath);
  const response = await sendFetchRequest(
    url,
    'PATCH',
    {
      path: newPath
    },
    { signal }
  );

  if (!response.ok) {
    if (response.status === 403) {
      throw new FetchError(response, 'Permission denied');
    }
    const body = await response.json().catch(() => ({}));
    const errorMessage =
      body.error || `Failed to rename file (${response.status})`;
    throw new FetchError(response, errorMessage);
  }
}

export function useRenameFileMutation(): UseMutationResult<
  void,
  Error,
  RenameFileParams
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: renameFile,
    onSuccess: (_, variables) => {
      // Invalidate the parent directory's file list
      queryClient.invalidateQueries({
        queryKey: fileQueryKeys.fspName(variables.fspName)
      });
    }
  });
}

type ChangePermissionsParams = {
  fspName: string;
  filePath: string;
  permissions: string;
  signal?: AbortSignal;
};

async function changePermissions({
  fspName,
  filePath,
  permissions,
  signal
}: ChangePermissionsParams): Promise<void> {
  const url = getFileBrowsePath(fspName, filePath);
  const response = await sendFetchRequest(
    url,
    'PATCH',
    {
      permissions
    },
    { signal }
  );

  if (!response.ok) {
    if (response.status === 403) {
      throw new FetchError(response, 'Permission denied');
    }
    const body = await response.json().catch(() => ({}));
    const errorMessage =
      body.error || `Failed to change permissions (${response.status})`;
    throw new FetchError(response, errorMessage);
  }
}

export function useChangePermissionsMutation(): UseMutationResult<
  void,
  Error,
  ChangePermissionsParams
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: changePermissions,
    onMutate: async variables => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: fileQueryKeys.fspName(variables.fspName)
      });

      // Snapshot the previous value for rollback on error
      const previousData = queryClient.getQueriesData({
        queryKey: fileQueryKeys.fspName(variables.fspName)
      });

      // Optimistically update all relevant queries
      queryClient.setQueriesData(
        { queryKey: fileQueryKeys.fspName(variables.fspName) },
        (old: FileQueryData | undefined) => {
          if (!old) {
            return old;
          }

          // Update the current file/folder if it matches
          const updatedCurrentFileOrFolder =
            old.currentFileOrFolder?.path === variables.filePath
              ? {
                  ...old.currentFileOrFolder,
                  permissions: variables.permissions
                }
              : old.currentFileOrFolder;

          // Update the file in the files array if it exists
          const updatedFiles = old.files.map(file =>
            file.path === variables.filePath
              ? { ...file, permissions: variables.permissions }
              : file
          );

          return {
            ...old,
            currentFileOrFolder: updatedCurrentFileOrFolder,
            files: updatedFiles
          };
        }
      );

      // Return context for rollback
      return { previousData };
    },
    onError: (_err, _variables, context) => {
      // Rollback to the previous data on error
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSuccess: (_, variables) => {
      // Invalidate the parent directory's file list to ensure consistency
      queryClient.invalidateQueries({
        queryKey: fileQueryKeys.fspName(variables.fspName)
      });
    }
  });
}
