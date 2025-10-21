import React from 'react';

import {
  getFileBrowsePath,
  joinPaths,
  sendFetchRequest,
  removeLastSegmentFromPath
} from '@/utils';
import { handleError, toHttpError } from '@/utils/errorHandling';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { Result } from '@/shared.types';

export default function useRenameDialog() {
  const [newName, setNewName] = React.useState<string>('');

  const { fileBrowserState, refreshFiles } = useFileBrowserContext();
  const { currentFileSharePath } = fileBrowserState;

  async function handleRenameSubmit(path: string): Promise<Result<void>> {
    if (!currentFileSharePath) {
      return handleError(new Error('No file share path selected.'));
    }

    try {
      const newPath = joinPaths(removeLastSegmentFromPath(path), newName);
      const fetchPath = getFileBrowsePath(currentFileSharePath?.name, path);
      const response = await sendFetchRequest(fetchPath, 'PATCH', {
        path: newPath
      });

      if (response.ok) {
        return await refreshFiles();
      } else {
        if (response.status === 403) {
          return handleError(new Error('Permission denied'));
        } else {
          throw await toHttpError(response);
        }
      }
    } catch (error) {
      return handleError(error);
    }
  }

  return {
    handleRenameSubmit,
    newName,
    setNewName
  };
}
