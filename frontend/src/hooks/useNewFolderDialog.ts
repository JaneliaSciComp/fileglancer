import React from 'react';

import { joinPaths } from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

export default function useNewFolderDialog() {
  const [newName, setNewName] = React.useState<string>('');

  const { fileBrowserState, fileQuery, mutations } = useFileBrowserContext();
  const currentFileOrFolder = fileQuery.data?.currentFileOrFolder;
  const currentFileSharePath = fileBrowserState.uiFileSharePath;

  const isDuplicateName = React.useMemo(() => {
    if (!newName.trim()) {
      return false;
    }
    return fileQuery.data?.files.some(
      file => file.name.toLowerCase() === newName.trim().toLowerCase()
    );
  }, [newName, fileQuery.data?.files]);

  async function handleNewFolderSubmit(): Promise<void> {
    if (!currentFileSharePath) {
      throw new Error('No file share path selected.');
    }
    if (!currentFileOrFolder) {
      throw new Error('No current file or folder selected.');
    }

    await mutations.createFolder.mutateAsync({
      fspName: currentFileSharePath.name,
      folderPath: joinPaths(currentFileOrFolder.path, newName)
    });
  }

  return {
    handleNewFolderSubmit,
    newName,
    setNewName,
    isDuplicateName
  };
}
