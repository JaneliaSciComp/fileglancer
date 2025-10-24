import React from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';

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
  const fetchFileInfo = async (): Promise<FileBrowserResponse> => {
    if (!fspName) {
      throw new Error('No file share path selected');
    }

    const url = getFileBrowsePath(fspName, folderName);

    const response = await sendFetchRequest(url, 'GET');
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
