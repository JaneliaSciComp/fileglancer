import React from 'react';
import {
  getFileBrowsePath,
  sendFetchRequest,
  removeLastSegmentFromPath,
  tryCatchWrapper
} from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useCookiesContext } from '@/contexts/CookiesContext';

export default function useRenameDialog() {
  const [newName, setNewName] = React.useState<string>('');

  const { handleFileBrowserNavigation } = useFileBrowserContext();
  const { currentFileSharePath } = useFileBrowserContext();
  const { cookies } = useCookiesContext();

  async function handleRenameSubmit(oldPath: string) {
    const parentPath = removeLastSegmentFromPath(oldPath);
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;

    return tryCatchWrapper('Rename item', async () => {
      if (!currentFileSharePath) {
        return {
          success: false,
          error: 'No file share path selected.'
        };
      }
      const fetchPath = getFileBrowsePath(currentFileSharePath.name, oldPath);

      await sendFetchRequest(fetchPath, 'PATCH', cookies['_xsrf'], {
        newName
      });

      const navResult = await handleFileBrowserNavigation({
        fspName: currentFileSharePath?.name,
        path: parentPath
      });

      if (!navResult.success) {
        return {
          success: false,
          error: `Item renamed but navigation failed: ${navResult.error}`
        };
      }

      return {
        success: true,
        oldPath,
        newPath
      };
    });
  }

  return {
    handleRenameSubmit,
    newName,
    setNewName
  };
}
