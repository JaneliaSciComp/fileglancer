import React from 'react';

import {
  getFileBrowsePath,
  joinPaths,
  sendFetchRequest,
  removeLastSegmentFromPath
} from '@/utils';
import {
  createSuccess,
  handleBadResponse,
  handleError
} from '@/utils/errorHandling';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { Result } from '@/shared.types';

export default function useRenameDialog() {
  const [newName, setNewName] = React.useState<string>('');

  const { currentFileSharePath, refreshFiles } = useFileBrowserContext();
  const { cookies } = useCookiesContext();

  async function handleRenameSubmit(path: string): Promise<Result<void>> {
    if (!currentFileSharePath) {
      return handleError(new Error('No file share path selected.'));
    }

    try {
      const newPath = joinPaths(removeLastSegmentFromPath(path), newName);
      const fetchPath = getFileBrowsePath(currentFileSharePath?.name, path);
      const response = await sendFetchRequest(
        fetchPath,
        'PATCH',
        cookies['_xsrf'],
        {
          path: newPath
        }
      );

      if (response.ok) {
        await refreshFiles();
      } else {
        return handleBadResponse(response);
      }
    } catch (error) {
      return handleError(error);
    }
    return createSuccess();
  }

  return {
    handleRenameSubmit,
    newName,
    setNewName
  };
}
