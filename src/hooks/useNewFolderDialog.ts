import { useState } from 'react';
import toast from 'react-hot-toast';

import {
  getFileBrowsePath,
  sendFetchRequest,
  joinPaths,
  getPreferredPathForDisplay
} from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';

export default function useNewFolderDialog() {
  const [newName, setNewName] = useState<string>('');
  const [showAlert, setShowAlert] = useState<boolean>(false);
  const [alertContent, setAlertContent] = useState<string>('');

  const { handleFileBrowserNavigation, currentFileOrFolder } =
    useFileBrowserContext();
  const { currentFileSharePath } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();
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
    setShowAlert(false);
    if (!currentFileSharePath) {
      setAlertContent('No file share path selected.');
      return false;
    } else if (!currentFileOrFolder) {
      setAlertContent('No current file or folder selected.');
      return false;
    } else {
      const displayPath = getPreferredPathForDisplay(
        pathPreference,
        currentFileSharePath,
        `${currentFileOrFolder.path}/${newName}`
      );
      try {
        await addNewFolder();
        await handleFileBrowserNavigation({
          fspName: currentFileSharePath.name,
          path: currentFileOrFolder.path
        });
        const alertContent = `Created new folder at path: ${displayPath}`;
        toast.success(alertContent);
        return true;
      } catch (error) {
        const errorContent = `Error creating new folder at path: ${displayPath}`;
        setAlertContent(
          `${errorContent}. Error details: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        return false;
      }
    }
  }

  return {
    handleNewFolderSubmit,
    newName,
    setNewName,
    showAlert,
    setShowAlert,
    alertContent
  };
}
