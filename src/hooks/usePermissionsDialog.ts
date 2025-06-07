import React from 'react';
import { default as log } from '@/logger';
import toast from 'react-hot-toast';

import {
  getAPIPathRoot,
  sendFetchRequest,
  removeLastSegmentFromPath
} from '../utils';
import { useCookiesContext } from '../contexts/CookiesContext';
import type { FileOrFolder } from '../shared.types';
import { useZoneBrowserContext } from '../contexts/ZoneBrowserContext';
import { useFileBrowserContext } from '../contexts/FileBrowserContext';

export default function usePermissionsDialog() {
  const [showAlert, setShowAlert] = React.useState<boolean>(false);
  const { cookies } = useCookiesContext();
  const { currentFileSharePath } = useZoneBrowserContext();
  const { fetchAndFormatFilesForDisplay } = useFileBrowserContext();

  async function handleChangePermissions(
    targetItem: FileOrFolder,
    localPermissions: FileOrFolder['permissions']
  ) {
    try {
      log.debug('Change permissions for item:', targetItem);
      await sendFetchRequest(
        `${getAPIPathRoot()}api/fileglancer/files/${currentFileSharePath?.name}?subpath=${targetItem.path}`,
        'PATCH',
        cookies['_xsrf'],
        {
          permissions: localPermissions
        }
      );
      await fetchAndFormatFilesForDisplay(
        `${currentFileSharePath?.name}?subpath=${removeLastSegmentFromPath(targetItem.path)}`
      );
      toast.success(
        `Successfully updated permissions for ${currentFileSharePath?.name}/${targetItem.path}`
      );
    } catch (error) {
      toast.error(
        `Error updating permissions for ${currentFileSharePath?.name}/${targetItem.path}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
    setShowAlert(true);
  }

  return { handleChangePermissions, showAlert, setShowAlert };
}
