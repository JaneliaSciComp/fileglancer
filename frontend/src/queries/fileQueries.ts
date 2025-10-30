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
  }: QueryFunctionContext): Promise<FileBrowserResponse> => {
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
      // Include partial data (info) if available from backend
      const error = new FetchError(
        response,
        errorMessage,
        body.info ? { info: body.info } : undefined
      );
      throw error;
    } else if (response.status === 404) {
      throw new Error('Folder not found');
    } else {
      throw new Error(
        body.error ? body.error : `Unknown error (${response.status})`
      );
    }
  };

  const transformData = React.useCallback(
    (data: FileBrowserResponse | { info: FileOrFolder }): FileQueryData => {
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
        files
      };
    },
    [fspName, zonesAndFspQuery.data]
  );

  const query = useQuery<FileBrowserResponse, Error, FileQueryData>({
    queryKey: fileQueryKeys.filePath(fspName || '', folderName),
    queryFn: fetchFileInfo,
    select: (data: FileBrowserResponse) => transformData(data),
    enabled: !!fspName && !!zonesAndFspQuery.data,
    staleTime: 5 * 60 * 1000 // 5 minutes - file listings don't change that often
  });

  // Handle 403 errors with fallback data from partial response
  const dataWithFallback = React.useMemo(() => {
    if (query.data) {
      return query.data;
    }

    // If there's a 403 error with partialData, extract and transform it
    if (query.error && (query.error as FetchError).partialData?.info) {
      const partialData = (query.error as FetchError).partialData;
      return transformData(partialData);
    }

    // If there's a 403 error without partialData (e.g., individual file access denied),
    // create a minimal fallback FileOrFolder object
    if (query.error && (query.error as FetchError).res?.status === 403) {
      const bodyInfo = (query.error as FetchError).partialData?.info;
      const targetPath = folderName || '.';

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
        hasWrite: bodyInfo?.hasWrite || false,
        permissions: bodyInfo?.permissions || ''
      };

      if (!fspName || !zonesAndFspQuery.data) {
        return undefined;
      }

      const fspKey = makeMapKey('fsp', fspName);
      const currentFileSharePath =
        (zonesAndFspQuery.data[fspKey] as FileSharePath) || null;

      return {
        currentFileSharePath,
        currentFileOrFolder: fallbackFileOrFolder,
        files: []
      };
    }

    return undefined;
  }, [
    query.data,
    query.error,
    fspName,
    folderName,
    zonesAndFspQuery.data,
    transformData
  ]);

  // Return enhanced query with fallback data
  return {
    ...query,
    data: dataWithFallback
  } as UseQueryResult<FileQueryData, Error>;
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
