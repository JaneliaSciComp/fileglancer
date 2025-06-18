import React from 'react';

import {
  getFileBrowsePath,
  sendFetchRequest,
  joinPaths,
  tryCatchWrapper
} from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useCookiesContext } from '@/contexts/CookiesContext';

export default function useNewFolderDialog() {
  const [newName, setNewName] = React.useState<string>('');

  const { handleFileBrowserNavigation, currentFileOrFolder } =
    useFileBrowserContext();
  const { currentFileSharePath } = useFileBrowserContext();
  const { cookies } = useCookiesContext();

  async function addNewFolder() {
    if (!currentFileSharePath) {
      throw new Error('No file share path selected.');
    }
    if (!currentFileOrFolder) {
      throw new Error('No current file or folder selected.');
    }
    await sendFetchRequest(
      getFileBrowsePath(
        currentFileSharePath.name,
        joinPaths(currentFileOrFolder.path, newName)
      ),
      'POST',
      cookies['_xsrf'],
      {
        type: 'directory'
      }
    );
  }

  async function handleNewFolderSubmit() {
    return tryCatchWrapper('Create new folder', async () => {
      await addNewFolder();
      const navResult = await handleFileBrowserNavigation({
        fspName: currentFileSharePath?.name,
        path: currentFileOrFolder?.path
      });

      if (!navResult.success) {
        return {
          success: false,
          error: `Folder created but navigation failed: ${navResult.error}`
        };
      }

      return {
        success: true,
        folderPath: `${currentFileOrFolder?.path}/${newName}`
      };
    });
  }

  return {
    handleNewFolderSubmit,
    newName,
    setNewName
  };
}
