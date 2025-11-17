import { useState } from 'react';

import { joinPaths, removeLastSegmentFromPath } from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { handleError, createSuccess } from '@/utils/errorHandling';
import type { Result } from '@/shared.types';

export default function useRenameDialog() {
  const [newName, setNewName] = useState<string>('');

  const { fileQuery, mutations } = useFileBrowserContext();
  const currentFileSharePath = fileQuery.data?.currentFileSharePath;

  async function handleRenameSubmit(path: string): Promise<Result<void>> {
    try {
      if (!currentFileSharePath) {
        throw new Error('No file share path selected.');
      }

      const newPath = joinPaths(removeLastSegmentFromPath(path), newName);

      await mutations.rename.mutateAsync({
        fspName: currentFileSharePath.name,
        oldPath: path,
        newPath
      });

      return createSuccess(undefined);
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
