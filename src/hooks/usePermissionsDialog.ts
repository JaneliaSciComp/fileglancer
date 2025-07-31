import React from 'react';

import { sendFetchRequest, getFileBrowsePath } from '@/utils';
import { useCookiesContext } from '@/contexts/CookiesContext';
import type { FileOrFolder, Result } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { handleBadResponse, handleError } from '@/utils/errorHandling';

export default function usePermissionsDialog() {
  const { cookies } = useCookiesContext();
  const {
    currentFileSharePath,
    refreshFiles,
    propertiesTarget: targetItem
  } = useFileBrowserContext();

  const [localPermissions, setLocalPermissions] = React.useState(
    targetItem ? targetItem.permissions : null
  );

  function handleLocalPermissionChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    if (!localPermissions) {
      return;
    }

    const { name, checked } = event.target;
    const [value, position] = name.split('_');

    setLocalPermissions(prev => {
      if (!prev) {
        return prev; // Ensure the type remains consistent
      }
      const splitPermissions = prev.split('');
      if (checked) {
        splitPermissions.splice(parseInt(position), 1, value);
      } else {
        splitPermissions.splice(parseInt(position), 1, '-');
      }
      const newPermissions = splitPermissions.join('');
      return newPermissions;
    });
  }

  async function handleChangePermissions(
    targetItem: FileOrFolder,
    localPermissions: FileOrFolder['permissions']
  ): Promise<Result<void>> {
    if (!currentFileSharePath) {
      return handleError(new Error('No file share path selected'));
    }

    const fetchPath = getFileBrowsePath(
      currentFileSharePath.name,
      targetItem.path
    );

    try {
      const response = await sendFetchRequest(
        fetchPath,
        'PATCH',
        cookies['_xsrf'],
        {
          permissions: localPermissions
        }
      );

      if (response.ok) {
        return await refreshFiles();
      } else {
        return handleBadResponse(response);
      }
    } catch (error) {
      return handleError(error);
    }
  }

  return {
    handleLocalPermissionChange,
    localPermissions,
    handleChangePermissions
  };
}
