import { useState, useMemo } from 'react';

import { joinPaths } from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import type { Result } from '@/shared.types';
import { createSuccess, handleError } from '@/utils/errorHandling';

export default function useNewFolderDialog() {
  const [newName, setNewName] = useState<string>('');

  const { fileQuery, mutations } = useFileBrowserContext();
  const { currentFileSharePath, currentFileOrFolder } = fileQuery.data || {};

  const isDuplicateName = useMemo(() => {
    if (!newName.trim()) {
      return false;
    }
    return fileQuery.data?.files.some(
      file => file.name.toLowerCase() === newName.trim().toLowerCase()
    );
  }, [newName, fileQuery.data?.files]);

  async function handleNewFolderSubmit(): Promise<Result<void>> {
    if (!currentFileSharePath) {
      return handleError(new Error('No file share path selected.'));
    }
    if (!currentFileOrFolder) {
      return handleError(new Error('No current file or folder selected.'));
    }

    try {
      await mutations.createFolder.mutateAsync({
        fspName: currentFileSharePath.name,
        folderPath: joinPaths(currentFileOrFolder.path, newName)
      });
      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    }
  }

  return {
    handleNewFolderSubmit,
    newName,
    setNewName,
    isDuplicateName
  };
}
