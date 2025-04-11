import React from 'react';
import { useCookiesContext } from '../contexts/CookiesContext';
import { getAPIPathRoot, sendGetRequest, sendPutRequest } from '../utils';

type PreferencesContextType = {
  pathPreference: ['linux_path'] | ['windows_path'] | ['mac_path'];
  handlePathPreferenceChange: (
    event: React.ChangeEvent<HTMLInputElement>
  ) => void;
  handlePathPreferenceSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  zoneFavorites: string[];
  setZoneFavorites: React.Dispatch<React.SetStateAction<string[]>>;
  fileSharePathFavorites: string[];
  setFileSharePathFavorites: React.Dispatch<React.SetStateAction<string[]>>;
  directoryFavorites: string[];
  setDirectoryFavorites: React.Dispatch<React.SetStateAction<string[]>>;
  handleFavoriteChange: (item: string, type: string) => Promise<void>;
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
  const [zoneFavorites, setZoneFavorites] = React.useState<string[]>([]);
  const [fileSharePathFavorites, setFileSharePathFavorites] = React.useState<
    string[]
  >([]);
  const [directoryFavorites, setDirectoryFavorites] = React.useState<string[]>(
    []
  );
  const { cookies } = useCookiesContext();

  React.useEffect(() => {
    const fetchPreferences = async () => {
      try {
        await sendGetRequest(
          `${getAPIPathRoot()}api/fileglancer/preference?key=pathPreference`,
          cookies['_xsrf']
        )
          .then(response => response.json())
          .then(data => {
            if (data) {
              setPathPreference(data);
            }
          });
        await sendGetRequest(
          `${getAPIPathRoot()}api/fileglancer/preference?key=zoneFavorites`,
          cookies['_xsrf']
        )
          .then(response => response.json())
          .then(data => {
            if (data) {
              setZoneFavorites(data);
            }
          });
        await sendGetRequest(
          `${getAPIPathRoot()}api/fileglancer/preference?key=fileSharePathFavorites`,
          cookies['_xsrf']
        )
          .then(response => response.json())
          .then(data => {
            if (data) {
              setFileSharePathFavorites(data);
            }
          });
        await sendGetRequest(
          `${getAPIPathRoot()}api/fileglancer/preference?key=directoryFavorites`,
          cookies['_xsrf']
        )
          .then(response => response.json())
          .then(data => {
            if (data) {
              setDirectoryFavorites(data);
            }
          });
      } catch (error) {
        console.error('Error fetching preferences:', error);
      }
    };
    fetchPreferences();
  }, []);

  const updatePreferences = async (key: string, body: string[]) => {
    try {
      await sendPutRequest(
        `${getAPIPathRoot()}api/fileglancer/preference?key=${key}`,
        cookies['_xsrf'],
        body
      );
    } catch (error) {
      console.error(`Error updating ${key}:`, error);
    }
  };

  function handlePathPreferenceChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const selectedPath = event.target.value.split(' ') as [
      'linux_path' | 'windows_path' | 'mac_path'
    ];
    setPathPreference(selectedPath);
  }

  function handlePathPreferenceSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updatePreferences('pathPreference', pathPreference);
  }

  const handleFavoriteChange = async (item: string, type: string) => {
    if (type === 'zone') {
      const newFavorites = zoneFavorites.includes(item)
        ? zoneFavorites.filter(zone => zone !== item)
        : [...zoneFavorites, item];
      setZoneFavorites(newFavorites);
      updatePreferences('zoneFavorites', newFavorites);
    } else if (type === 'fileSharePath') {
      const newFavorites = fileSharePathFavorites.includes(item)
        ? fileSharePathFavorites.filter(path => path !== item)
        : [...fileSharePathFavorites, item];
      setFileSharePathFavorites(newFavorites);
      updatePreferences('fileSharePathFavorites', newFavorites);
    } else if (type === 'directory') {
      const newFavorites = directoryFavorites.includes(item)
        ? directoryFavorites.filter(dir => dir !== item)
        : [...directoryFavorites, item];
      setDirectoryFavorites(newFavorites);
      updatePreferences('directoryFavorites', newFavorites);
    }
  };
  return (
    <PreferencesContext.Provider
      value={{
        pathPreference,
        handlePathPreferenceChange,
        handlePathPreferenceSubmit,
        zoneFavorites,
        setZoneFavorites,
        fileSharePathFavorites,
        setFileSharePathFavorites,
        directoryFavorites,
        setDirectoryFavorites,
        handleFavoriteChange
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
};
