import React from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';

import { sendFetchRequest, getFileBrowsePath, makeMapKey } from '@/utils';
import { normalizePosixStylePath } from '@/utils/pathHandling';
import type { FileOrFolder, FileSharePath } from '@/shared.types';
import { useCookiesContext } from '@/contexts/CookiesContext';
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
  const { cookies } = useCookiesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  // Function to fetch files for the current FSP and current folder
  const fetchFileInfo = async (): Promise<FileBrowserResponse> => {
    if (!fspName) {
      throw new Error('No file share path selected');
    }

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
  };

  const transformData = (data: FileBrowserResponse): FileQueryData => {
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
    let files = (data.files || []).map(file => ({
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
  };

  const query = useQuery<FileBrowserResponse, Error, FileQueryData>({
    queryKey: fileQueryKeys.filePath(fspName || '', folderName),
    queryFn: fetchFileInfo,
    select: (data: FileBrowserResponse) => transformData(data),
    enabled: !!fspName && !!zonesAndFspQuery.data,
    staleTime: 5 * 60 * 1000 // 5 minutes - file listings don't change that often
  });

  // Handle 403 errors with fallback currentFileOrFolder
  const currentFileOrFolderWithFallback = React.useMemo(() => {
    if (query.data?.currentFileOrFolder) {
      return query.data.currentFileOrFolder;
    }

    // If there's a 403 error with body.info, create a fallback FileOrFolder
    if (query.error && (query.error as any).info) {
      const bodyInfo = (query.error as any).info;
      return {
        name:
          bodyInfo?.name ||
          (folderName === '.' ? '' : folderName.split('/').pop() || ''),
        path: normalizePosixStylePath(bodyInfo?.path || folderName),
        is_dir: bodyInfo?.is_dir ?? true,
        size: bodyInfo?.size || 0,
        last_modified: bodyInfo?.last_modified || 0,
        owner: bodyInfo?.owner || '',
        group: bodyInfo?.group || '',
        hasRead: bodyInfo?.hasRead || false,
        hasWrite: bodyInfo?.hasWrite || false,
        permissions: bodyInfo?.permissions || ''
      } as FileOrFolder;
    }

    return null;
  }, [query.data?.currentFileOrFolder, query.error, folderName]);

  // Return enhanced query with fallback data
  return {
    ...query,
    data: query.data
      ? {
          ...query.data,
          currentFileOrFolder: currentFileOrFolderWithFallback
        }
      : undefined
  } as UseQueryResult<FileQueryData, Error>;
}
