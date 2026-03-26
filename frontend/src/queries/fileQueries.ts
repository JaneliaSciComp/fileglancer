import {
  useInfiniteQuery,
  useMutation,
  useQueryClient
} from '@tanstack/react-query';
import type {
  UseInfiniteQueryResult,
  UseMutationResult,
  InfiniteData
} from '@tanstack/react-query';

import { sendFetchRequest, buildUrl, makeMapKey } from '@/utils';
import { normalizePosixStylePath } from '@/utils/pathHandling';
import type { FileOrFolder, FileSharePath } from '@/shared.types';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import {
  getResponseJsonOrError,
  throwResponseNotOkError,
  sendRequestAndThrowForNotOk
} from './queryUtils';

const PAGE_SIZE = 200;

type FileBrowserPageResponse = {
  info: FileOrFolder;
  files: FileOrFolder[];
  has_more?: boolean;
  next_cursor?: string | null;
  total_count?: number | null;
};

export type FileQueryData = {
  currentFileSharePath: FileSharePath | null;
  currentFileOrFolder: FileOrFolder | null;
  files: FileOrFolder[];
  errorMessage?: string;
  hasMore: boolean;
  totalCount: number | null;
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
): UseInfiniteQueryResult<FileQueryData, Error> {
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  const fetchFileInfoPage = async ({
    signal,
    pageParam
  }: {
    signal: AbortSignal;
    pageParam: string | null;
  }): Promise<FileBrowserPageResponse> => {
    if (!fspName) {
      throw new Error('No file share path selected');
    }

    const queryParams: Record<string, string> = {
      limit: String(PAGE_SIZE)
    };
    if (folderName) {
      queryParams.subpath = folderName;
    }
    if (pageParam) {
      queryParams.cursor = pageParam;
    }

    const url = buildUrl('/api/files/', fspName, queryParams);
    const response = await sendFetchRequest(url, 'GET', undefined, { signal });
    const body = await getResponseJsonOrError(response);

    if (response.ok) {
      return body as FileBrowserPageResponse;
    }

    if (response.status === 403) {
      const errorMessage =
        body.info && body.info.owner
          ? `You do not have permission to list this folder. Contact the owner (${body.info.owner}) for access.`
          : 'You do not have permission to list this folder. Contact the owner for access.';
      throw new Error(errorMessage);
    } else if (response.status === 404) {
      throw new Error('Folder not found');
    } else {
      throwResponseNotOkError(response, body);
    }
  };

  const transformData = (
    data: InfiniteData<FileBrowserPageResponse>
  ): FileQueryData => {
    if (!fspName) {
      throw new Error('fspName is required for transforming file query data');
    }

    const fspKey = makeMapKey('fsp', fspName);
    const currentFileSharePath =
      (zonesAndFspQuery.data?.[fspKey] as FileSharePath) || null;

    // Use info from first page
    const firstPage = data.pages[0];
    let currentFileOrFolder: FileOrFolder | null = firstPage?.info ?? null;
    if (currentFileOrFolder) {
      currentFileOrFolder = {
        ...currentFileOrFolder,
        path: normalizePosixStylePath(currentFileOrFolder.path)
      };
    }

    // Flatten all pages' files
    const allFiles: FileOrFolder[] = [];
    for (const page of data.pages) {
      const rawFiles = 'files' in page ? page.files : [];
      for (const file of rawFiles || []) {
        allFiles.push({
          ...file,
          path: normalizePosixStylePath(file.path)
        } as FileOrFolder);
      }
    }

    // Sort: directories first, then alphabetically
    allFiles.sort((a: FileOrFolder, b: FileOrFolder) => {
      if (a.is_dir === b.is_dir) {
        return a.name.localeCompare(b.name);
      }
      return a.is_dir ? -1 : 1;
    });

    const lastPage = data.pages[data.pages.length - 1];
    return {
      currentFileSharePath,
      currentFileOrFolder,
      files: allFiles,
      hasMore: lastPage?.has_more ?? false,
      totalCount: lastPage?.total_count ?? null
    };
  };

  return useInfiniteQuery<
    FileBrowserPageResponse,
    Error,
    FileQueryData,
    readonly (string | undefined)[],
    string | null
  >({
    queryKey: fileQueryKeys.filePath(fspName || '', folderName),
    queryFn: fetchFileInfoPage,
    select: transformData,
    initialPageParam: null,
    getNextPageParam: lastPage =>
      lastPage.has_more ? (lastPage.next_cursor ?? null) : null,
    enabled: !!fspName && !!zonesAndFspQuery.data,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (
        error instanceof Error &&
        (error.message.includes('permission') ||
          error.message.includes('Internal Server Error'))
      ) {
        return false;
      }
      return failureCount < 3;
    }
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
};

async function deleteFile({
  fspName,
  filePath
}: DeleteFileParams): Promise<void> {
  const url = buildUrl('/api/files/', fspName, { subpath: filePath });
  await sendRequestAndThrowForNotOk(url, 'DELETE');
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
};

async function createFolder({
  fspName,
  folderPath
}: CreateFolderParams): Promise<void> {
  const url = buildUrl('/api/files/', fspName, { subpath: folderPath });
  await sendRequestAndThrowForNotOk(url, 'POST', {
    type: 'directory'
  });
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
};

async function renameFile({
  fspName,
  oldPath,
  newPath
}: RenameFileParams): Promise<void> {
  const url = buildUrl('/api/files/', fspName, { subpath: oldPath });
  await sendRequestAndThrowForNotOk(url, 'PATCH', { path: newPath });
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
};

async function changePermissions({
  fspName,
  filePath,
  permissions
}: ChangePermissionsParams): Promise<void> {
  const url = buildUrl('/api/files/', fspName, { subpath: filePath });
  await sendRequestAndThrowForNotOk(url, 'PATCH', { permissions });
}

export function useChangePermissionsMutation(): UseMutationResult<
  void,
  Error,
  ChangePermissionsParams
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: changePermissions,
    onSuccess: (_, variables) => {
      // Invalidate the parent directory's file list to ensure consistency
      queryClient.invalidateQueries({
        queryKey: fileQueryKeys.fspName(variables.fspName)
      });
    }
  });
}
