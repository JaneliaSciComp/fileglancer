import { useState } from 'react';
import toast from 'react-hot-toast';

import {
  getFileFetchPath,
  joinPaths,
  sendFetchRequest,
  removeLastSegmentFromPath,
  getPreferredPathForDisplay
} from '../utils';
import { useFileBrowserContext } from '../contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useCookiesContext } from '../contexts/CookiesContext';

export default function useRenameDialog() {
  const [newName, setNewName] = useState<string>('');
  const [showAlert, setShowAlert] = useState<boolean>(false);
  const [alertContent, setAlertContent] = useState<string>('');

  const {
    handleFileBrowserNavigation,
    currentFileSharePath,
    currentFileOrFolder
  } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();
  const { cookies } = useCookiesContext();

  async function renameItem(path: string) {
    if (!currentFileSharePath) {
      throw new Error('No file share path selected.');
    }
    const newPath = joinPaths(removeLastSegmentFromPath(path), newName);
    const fetchPath = getFileFetchPath(currentFileSharePath?.name, path);
    await sendFetchRequest(fetchPath, 'PATCH', cookies['_xsrf'], {
      path: newPath
    });
    await handleFileBrowserNavigation({
      fspName: currentFileSharePath.name,
      path: currentFileOrFolder?.path
    });
  }

  async function handleRenameSubmit(path: string) {
    setShowAlert(false);
    const displayPath = getPreferredPathForDisplay(
      pathPreference,
      currentFileSharePath,
      path
    );

    if (currentFileSharePath) {
      try {
        await renameItem(path);
        const alertContent = `Renamed item at path: ${displayPath} to ${newName}`;
        toast.success(alertContent);
        return true;
      } catch (error) {
        const errorContent = `Error renaming item at path: ${displayPath} to ${newName}`;
        setAlertContent(
          `${errorContent}. Error details: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        setShowAlert(true);
        return false;
      }
    } else if (!currentFileSharePath) {
      setAlertContent('No file share path selected.');
      return false;
    }
  }

  return {
    handleRenameSubmit,
    newName,
    setNewName,
    showAlert,
    setShowAlert,
    alertContent
  };
}
