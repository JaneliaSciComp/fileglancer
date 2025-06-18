import React from 'react';

import {
  sendFetchRequest,
  removeLastSegmentFromPath,
  getFileBrowsePath,
  tryCatchWrapper
} from '@/utils';
import { useCookiesContext } from '@/contexts/CookiesContext';
import type { FileOrFolder } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

export default function usePermissionsDialog() {
  const [showAlert, setShowAlert] = React.useState<boolean>(false);
  const { cookies } = useCookiesContext();
  const { handleFileBrowserNavigation, currentFileSharePath } =
    useFileBrowserContext();

  async function handleChangePermissions(
    targetItem: FileOrFolder,
    localPermissions: FileOrFolder['permissions']
  ) {
    if (!currentFileSharePath) {
      return {
        success: false,
        error: 'No file share path selected.'
      };
    }

    const fetchPath = getFileBrowsePath(
      currentFileSharePath.name,
      targetItem.path
    );

    return tryCatchWrapper('Update permissions', async () => {
      await sendFetchRequest(fetchPath, 'PATCH', cookies['_xsrf'], {
        permissions: localPermissions
      });

      const navResult = await handleFileBrowserNavigation({
        fspName: currentFileSharePath.name,
        path: removeLastSegmentFromPath(targetItem.path)
      });

      if (!navResult.success) {
        return {
          success: false,
          error: `Permissions updated but navigation failed: ${navResult.error}`
        };
      }

      setShowAlert(true);

      return {
        success: true,
        targetPath: targetItem.path
      };
    });
  }

  return { handleChangePermissions, showAlert, setShowAlert };
}
