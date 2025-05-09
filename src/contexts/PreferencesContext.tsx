import React from 'react';
import type { FileOrFolder, FileSharePath, Zone } from '../shared.types';
import { useCookiesContext } from '../contexts/CookiesContext';
import { getAPIPathRoot, sendFetchRequest, makeMapKey } from '../utils';

type PreferencesContextType = {
  pathPreference: ['linux_path'] | ['windows_path'] | ['mac_path'];
  showPathPrefAlert: boolean;
  setShowPathPrefAlert: React.Dispatch<React.SetStateAction<boolean>>;
  handlePathPreferenceSubmit: (
    event: React.FormEvent<HTMLFormElement>,
    localPathPreference: PreferencesContextType['pathPreference']
  ) => void;
  zoneFavorites: Record<string, null>;
  setZoneFavorites: React.Dispatch<React.SetStateAction<Record<string, null>>>;
  fileSharePathFavorites: Record<string, null>;
  setFileSharePathFavorites: React.Dispatch<
    React.SetStateAction<Record<string, null>>
  >;
  folderFavorites: Record<string, null>;
  setFolderFavorites: React.Dispatch<
    React.SetStateAction<Record<string, null>>
  >;
  handleFavoriteChange: (
    item: Zone | FileSharePath | { fsp_name: string; folders: FileOrFolder[] },
    type: string
  ) => Promise<void>;
};

const PreferencesContext = React.createContext<PreferencesContextType | null>(
  null
);

export const usePreferencesContext = () => {
  const context = React.useContext(PreferencesContext);
  if (!context) {
    throw new Error(
      'usePreferencesContext must be used within a PreferencesProvider'
    );
  }
  return context;
};

export const PreferencesProvider = ({
  children
}: {
  children: React.ReactNode;
}) => {
  const [pathPreference, setPathPreference] = React.useState<
    ['linux_path'] | ['windows_path'] | ['mac_path']
  >(['linux_path']);
  const [showPathPrefAlert, setShowPathPrefAlert] = React.useState(false);

  const [zoneFavorites, setZoneFavorites] = React.useState<
    Record<string, null>
  >({});
  const [fileSharePathFavorites, setFileSharePathFavorites] = React.useState<
    Record<string, null>
  >({});
  const [folderFavorites, setFolderFavorites] = React.useState<
    Record<string, null>
  >({});
  const { cookies } = useCookiesContext();

  async function fetchPreferences<T>(
    key: string,
    setStateFunction: React.Dispatch<React.SetStateAction<T>>
  ) {
    try {
      await sendFetchRequest(
        `${getAPIPathRoot()}api/fileglancer/preference?key=${key}`,
        'GET',
        cookies['_xsrf']
      )
        .then(response => response.json())
        .then(data => {
          if (data.value) {
            setStateFunction(data.value);
          }
        });
    } catch (error) {
      console.log(
        `Potential error fetching preferences, or preference with key ${key} is not set:`,
        error
      );
    }
  }

  React.useEffect(() => {
    fetchPreferences('pathPreference', setPathPreference);
  }, []);

  React.useEffect(() => {
    fetchPreferences('zoneFavorites', setZoneFavorites);
  }, []);

  React.useEffect(() => {
    fetchPreferences('fileSharePathFavorites', setFileSharePathFavorites);
  }, []);

  React.useEffect(() => {
    fetchPreferences('folderFavorites', setFolderFavorites);
  }, []);

  async function savePreferencesToBackend<T>(key: string, value: T) {
    try {
      await sendFetchRequest(
        `${getAPIPathRoot()}api/fileglancer/preference?key=${key}`,
        'PUT',
        cookies['_xsrf'],
        { value: value }
      );
    } catch (error) {
      console.error(`Error updating ${key}:`, error);
    }
  }

  function handlePathPreferenceSubmit(
    event: React.FormEvent<HTMLFormElement>,
    localPathPreference: ['linux_path'] | ['windows_path'] | ['mac_path']
  ) {
    event.preventDefault();
    try {
      savePreferencesToBackend('path', localPathPreference);
      setPathPreference(localPathPreference);
      setShowPathPrefAlert(true);
    } catch (error) {
      console.error('Error updating path preference:', error);
      setShowPathPrefAlert(false);
    }
  }

  function updateFavoriteState(
    favoritesMap: Record<string, null>,
    newItemKey: string
  ) {
    if (!favoritesMap[newItemKey]) {
      favoritesMap[newItemKey] = null;
    } else if (favoritesMap[newItemKey]) {
      delete favoritesMap[newItemKey];
    }
    return favoritesMap;
  }

  function handleZoneFavoriteChange(item: Zone) {
    const newItemKey = makeMapKey('zone', item.name);
    const newZoneFavorites = { ...zoneFavorites };
    try {
      savePreferencesToBackend('zone', { type: 'zone', name: item.name });
      setZoneFavorites(updateFavoriteState(newZoneFavorites, newItemKey));
    } catch (error) {
      console.error('Error updating zone favorites:', error);
    }
  }

  function handleFileSharePathFavoriteChange(item: FileSharePath) {
    const newItemKey = makeMapKey('fsp', item.name);
    const newFileSharePathFavorites = { ...fileSharePathFavorites };
    try {
      savePreferencesToBackend('fileSharePath', {
        type: 'fileSharePath',
        name: item.name
      });
      setFileSharePathFavorites(
        updateFavoriteState(newFileSharePathFavorites, newItemKey)
      );
    } catch (error) {
      console.error('Error updating file share path favorites:', error);
    }
  }

  function handleFolderFavoriteChange(item: {
    fsp_name: string;
    folders: FileOrFolder[];
  }) {
    let newFolderFavorites = { ...folderFavorites };
    try {
      item.folders.forEach(folder => {
        const newItemKey = makeMapKey(
          'folder',
          `${item.fsp_name}_${folder.path}`
        );
        newFolderFavorites = updateFavoriteState(
          newFolderFavorites,
          newItemKey
        );
        savePreferencesToBackend('folder', {
          type: 'folder',
          fsp_name: item.fsp_name,
          path: folder.path
        });
      });
      setFolderFavorites(newFolderFavorites);
    } catch (error) {
      console.error('Error updating folder favorites:', error);
    }
  }

  async function handleFavoriteChange(
    item: Zone | FileSharePath | { fsp_name: string; folders: FileOrFolder[] },
    type: string
  ) {
    switch (type) {
      case 'zone':
        handleZoneFavoriteChange(item as Zone);
        break;
      case 'fileSharePath':
        handleFileSharePathFavoriteChange(item as FileSharePath);
        break;
      case 'directory':
        handleFolderFavoriteChange(
          item as { fsp_name: string; folders: FileOrFolder[] }
        );
        break;
      default:
        console.error('Invalid type provided for handleFavoriteChange:', type);
        break;
    }
  }

  return (
    <PreferencesContext.Provider
      value={{
        pathPreference,
        showPathPrefAlert,
        setShowPathPrefAlert,
        handlePathPreferenceSubmit,
        zoneFavorites,
        setZoneFavorites,
        fileSharePathFavorites,
        setFileSharePathFavorites,
        folderFavorites,
        setFolderFavorites,
        handleFavoriteChange
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};
