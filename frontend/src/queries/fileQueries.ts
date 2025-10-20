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

export default function useFileQuery(
  fspName: string,
  folderName: string
): UseQueryResult<FileQueryData, Error> {
  const { cookies } = useCookiesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  // Function to fetch files for the current FSP and current folder
  const fetchFileInfo = async (): Promise<FileBrowserResponse> => {
    const url = getFileBrowsePath(fspName, folderName);

    const response = await sendFetchRequest(url, 'GET', cookies['_xsrf']);
    const body = await response.json();

    if (!response.ok) {
      if (response.status === 403) {
        if (body.info && body.info.owner) {
          throw new Error(
            `You do not have permission to list this folder. Contact the owner (${body.info.owner}) for access.`
          );
        } else {
          throw new Error(
            'You do not have permission to list this folder. Contact the owner for access.'
          );
        }
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

  return useQuery<FileBrowserResponse, Error, FileQueryData>({
    queryKey: ['files', fspName, folderName],
    queryFn: fetchFileInfo,
    select: (data: FileBrowserResponse) => transformData(data)
  });
}
