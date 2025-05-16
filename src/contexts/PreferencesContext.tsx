import React from 'react';
import type { FileOrFolder, FileSharePath, Zone } from '../shared.types';
import { useCookiesContext } from '../contexts/CookiesContext';
import { useZoneBrowserContext } from './ZoneBrowserContext';
import { getAPIPathRoot, sendFetchRequest, makeMapKey } from '../utils';

type PreferencesContextType = {
  pathPreference: ['linux_path'] | ['windows_path'] | ['mac_path'];
  showPathPrefAlert: boolean;
  setShowPathPrefAlert: React.Dispatch<React.SetStateAction<boolean>>;
  handlePathPreferenceSubmit: (
    event: React.FormEvent<HTMLFormElement>,
    localPathPreference: PreferencesContextType['pathPreference']
  ) => void;
  zoneFavorites: Zone[];
  setZoneFavorites: React.Dispatch<React.SetStateAction<Zone[]>>;
  zonePreferenceKeys: string[];
  // fileSharePathFavorites: Record<string, FileSharePath>;
  // setFileSharePathFavorites: React.Dispatch<
  //   React.SetStateAction<Record<string, FileSharePath>>
  // >;
  // folderFavorites: Record<string, FileSharePath>;
  // setFolderFavorites: React.Dispatch<
  //   React.SetStateAction<Record<string, FileSharePath>>
  // >;
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

  const [zonePreferenceKeys, setZonePreferenceKeys] = React.useState<string[]>(
    []
  );
  const [zoneFavorites, setZoneFavorites] = React.useState<Zone[]>([]);
  // const [fileSharePathFavorites, setFileSharePathFavorites] = React.useState<
  //   Record<string, null>
  // >({});
  // const [folderFavorites, setFolderFavorites] = React.useState<
  //   Record<string, null>
  // >({});

  const { cookies } = useCookiesContext();
  const { isZonesMapReady, zonesAndFileSharePathsMap } =
    useZoneBrowserContext();

  async function fetchPreferences(
    key: string
    // setStateFunction: React.Dispatch<React.SetStateAction<T>>
  ) {
    try {
      const data = await sendFetchRequest(
        `${getAPIPathRoot()}api/fileglancer/preference?key=${key}`,
        'GET',
        cookies['_xsrf']
      ).then(response => response.json());
      return data?.value;
    } catch (error) {
      console.log(
        `Potential error fetching preferences, or preference with key ${key} is not set:`,
        error
      );
    }
  }

  function accessMapItems(keys: string[]) {
    console.log('keys in accessMapItems: ', keys);
    return keys.map(key => {
      console.log(
        'item accessed by key in accessMapItems: ',
        zonesAndFileSharePathsMap[key]
      );
      return zonesAndFileSharePathsMap[key];
    });
  }

  React.useEffect(() => {
    (async function () {
      const rawPathPreference = await fetchPreferences('pathPreference');
      if (rawPathPreference) {
        // const pathPreference = rawPathPreference as
        //   | ['linux_path']
        //   | ['windows_path']
        //   | ['mac_path'];
        setPathPreference(rawPathPreference);
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!isZonesMapReady) {
      return;
    }

    (async function () {
      const rawZonePreferences = await fetchPreferences('zone');
      if (rawZonePreferences) {
        // const zonePreferences = rawZonePreferences as Record<string, Zone>;
        setZonePreferenceKeys(rawZonePreferences);
        console.log('zone prefs from initial use effect: ', rawZonePreferences);
        const zoneFavorites = accessMapItems(rawZonePreferences) as Zone[];
        console.log('zone favs in initial use effect: ', zoneFavorites);
        setZoneFavorites(zoneFavorites);
      }
    })();
  }, [isZonesMapReady]);

  // React.useEffect(() => {
  //   fetchPreferences('fileSharePathFavorites', setFileSharePathFavorites);
  // }, []);

  // React.useEffect(() => {
  //   fetchPreferences('folderFavorites', setFolderFavorites);
  // }, []);

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

  function updatePreferenceKeyList(key: string, favoritesList: string[]) {
    const updatedFavorites = [...favoritesList];
    const keyIndex = updatedFavorites.indexOf(key);
    if (keyIndex < 0) {
      updatedFavorites.push(key);
    } else if (keyIndex >= 0) {
      updatedFavorites.splice(keyIndex, 1);
    }
    return updatedFavorites;
  }

  async function handleZoneFavoriteChange(item: Zone) {
    const key = makeMapKey('zone', item.name);
    const updatedZonePreferenceKeys = updatePreferenceKeyList(
      key,
      zonePreferenceKeys
    );

    try {
      console.log('saving pref to backend: ', updatedZonePreferenceKeys);
      await savePreferencesToBackend('zone', updatedZonePreferenceKeys);
      setZonePreferenceKeys(updatedZonePreferenceKeys);

      const updatedZoneFavorites = accessMapItems(updatedZonePreferenceKeys);
      setZoneFavorites(updatedZoneFavorites as Zone[]);
    } catch (error) {
      console.error('Error updating zone favorites:', error);
    }
  }

  // function handleFileSharePathFavoriteChange(item: FileSharePath) {
  //   const newItemKey = makeMapKey('fsp', item.name);
  //   const newFileSharePathFavorites = { ...fileSharePathFavorites };
  //   try {
  //     savePreferencesToBackend('fileSharePath', {
  //       type: 'fileSharePath',
  //       name: item.name
  //     });
  //     setFileSharePathFavorites(
  //       updateFavoriteState(newFileSharePathFavorites, newItemKey)
  //     );
  //   } catch (error) {
  //     console.error('Error updating file share path favorites:', error);
  //   }
  // }

  // function handleFolderFavoriteChange(item: {
  //   fsp_name: string;
  //   folders: FileOrFolder[];
  // }) {
  //   let newFolderFavorites = { ...folderFavorites };
  //   try {
  //     item.folders.forEach(folder => {
  //       const newItemKey = makeMapKey(
  //         'folder',
  //         `${item.fsp_name}_${folder.path}`
  //       );
  //       newFolderFavorites = updateFavoriteState(
  //         newFolderFavorites,
  //         newItemKey
  //       );
  //       savePreferencesToBackend('folder', {
  //         type: 'folder',
  //         fsp_name: item.fsp_name,
  //         path: folder.path
  //       });
  //     });
  //     setFolderFavorites(newFolderFavorites);
  //   } catch (error) {
  //     console.error('Error updating folder favorites:', error);
  //   }
  // }

  async function handleFavoriteChange(
    item: Zone | FileSharePath | { fsp_name: string; folders: FileOrFolder[] },
    type: string
  ) {
    switch (type) {
      case 'zone':
        try {
          await handleZoneFavoriteChange(item as Zone);
        } catch (error) {
          console.log(error);
        }
        break;
      // case 'fileSharePath':
      //   handleFileSharePathFavoriteChange(item as FileSharePath);
      //   break;
      // case 'directory':
      //   handleFolderFavoriteChange(
      //     item as { fsp_name: string; folders: FileOrFolder[] }
      //   );
      // break;
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
        zonePreferenceKeys,
        zoneFavorites,
        setZoneFavorites,
        // fileSharePathFavorites,
        // setFileSharePathFavorites,
        // folderFavorites,
        // setFolderFavorites,
        handleFavoriteChange
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};
