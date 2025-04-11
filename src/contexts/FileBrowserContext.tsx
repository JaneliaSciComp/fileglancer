import React from 'react';
import { File } from '../shared.types';
import { getAPIPathRoot, sendGetRequest } from '../utils';
import { useCookiesContext } from './CookiesContext';

type FileBrowserContextType = {
  files: File[];
  currentNavigationPath: File['path'];
  fetchAndFormatFilesForDisplay: (path: File['path']) => Promise<void>;
};

const FileBrowserContext = React.createContext<FileBrowserContextType | null>(
  null
);

export const useFileBrowserContext = () => {
  const context = React.useContext(FileBrowserContext);
  if (!context) {
    throw new Error('useFilesContext must be used within a FilesProvider');
  }
  return context;
};

export const FileBrowserContextProvider = ({
  children
}: {
  children: React.ReactNode;
}) => {
  const [files, setFiles] = React.useState<File[]>([]);
  const [currentNavigationPath, setCurrentNavigationPath] =
    React.useState<File['path']>('');

  const { cookies } = useCookiesContext();

  async function fetchAndFormatFilesForDisplay(
    path: File['path']
  ): Promise<void> {
    let cleanPath = path;

    if (path && path.trim() !== '') {
      // Remove leading slash from path if present to avoid double slashes
      cleanPath = path.trim().startsWith('/')
        ? path.trim().substring(1)
        : path.trim();
    }

    const url = `${getAPIPathRoot()}api/fileglancer/files/${cleanPath}`;

    let data = [];
    try {
      const response = await sendGetRequest(url, cookies['_xsrf']);

      data = await response.json();
      if (data) {
        setCurrentNavigationPath(path);
      }
      if (data.files) {
        // display directories first, then files
        // within a type (directories or files), display alphabetically
        data.files = data.files.sort((a: File, b: File) => {
          if (a.is_dir === b.is_dir) {
            return a.name.localeCompare(b.name);
          }
          return a.is_dir ? -1 : 1;
        });
        setFiles(data.files as File[]);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error.message);
      } else {
        console.error('An unknown error occurred');
      }
    }
  }

  return (
    <FileBrowserContext.Provider
      value={{
        files,
        currentNavigationPath,
        fetchAndFormatFilesForDisplay
      }}
    >
      {children}
    </FileBrowserContext.Provider>
  );
};
