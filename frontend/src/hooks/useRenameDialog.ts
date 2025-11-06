import React from 'react';

import { joinPaths, removeLastSegmentFromPath } from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { handleError, createSuccess } from '@/utils/errorHandling';
import type { Result } from '@/shared.types';

export default function useRenameDialog() {
  const [newName, setNewName] = React.useState<string>('');

  const { fileBrowserState, mutations } = useFileBrowserContext();
  const currentFileSharePath = fileBrowserState.uiFileSharePath;

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
