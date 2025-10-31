import React from 'react';

import { joinPaths, removeLastSegmentFromPath } from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

export default function useRenameDialog() {
  const [newName, setNewName] = React.useState<string>('');

  const { fileBrowserState, mutations } = useFileBrowserContext();
  const currentFileSharePath = fileBrowserState.uiFileSharePath;

  async function handleRenameSubmit(path: string): Promise<void> {
    if (!currentFileSharePath) {
      throw new Error('No file share path selected.');
    }

    const newPath = joinPaths(removeLastSegmentFromPath(path), newName);

    await mutations.rename.mutateAsync({
      fspName: currentFileSharePath.name,
      oldPath: path,
      newPath
    });
  }

  return {
    handleRenameSubmit,
    newName,
    setNewName
  };
}
