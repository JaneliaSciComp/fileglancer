import React from 'react';
import { default as log } from '@/logger';
import { FileOrFolder } from '../shared.types';
import { getFileFetchPath, sendFetchRequest } from '../utils';
import { useCookiesContext } from './CookiesContext';

type FileBrowserContextType = {
  files: FileOrFolder[];
  currentNavigationPath: FileOrFolder['path'];
  dirArray: string[];
  currentDir: string;
  getFileFetchPath: (path: string) => string;
  setCurrentNavigationPath: React.Dispatch<
    React.SetStateAction<FileOrFolder['path']>
  >;
  fetchAndFormatFilesForDisplay: (path: FileOrFolder['path']) => Promise<void>;
};

const FileBrowserContext = React.createContext<FileBrowserContextType | null>(
  null
);

export const useFileBrowserContext = () => {
  const context = React.useContext(FileBrowserContext);
  if (!context) {
    throw new Error(
      'useFileBrowserContext must be used within a FileBrowserContextProvider'
    );
  }
  return context;
};

export const FileBrowserContextProvider = ({
  children
}: {
  children: React.ReactNode;
}) => {
  const [files, setFiles] = React.useState<FileOrFolder[]>([]);
  const [currentNavigationPath, setCurrentNavigationPath] =
    React.useState<FileOrFolder['path']>('');
  const [dirArray, setDirArray] = React.useState<string[]>([]);
  const [currentDir, setCurrentDir] = React.useState<string>('');

  const { cookies } = useCookiesContext();

  const makeDirArray = React.useCallback(
    (path: string) => {
      if (currentNavigationPath.includes('?subpath=')) {
        const firstSegment = currentNavigationPath.split('?subpath=')[0];
        const subpathSegment = currentNavigationPath.split('?subpath=')[1];
        const subpathArray = subpathSegment
          .split('/')
          .filter(item => item !== '');
        return [firstSegment, ...subpathArray];
      } else {
        return [path];
      }
    },
    [currentNavigationPath]
  );

  async function fetchAndFormatFilesForDisplay(
    path: FileOrFolder['path']
  ): Promise<void> {
    const url = getFileFetchPath(path);

    let data = [];
    try {
      const response = await sendFetchRequest(url, 'GET', cookies['_xsrf']);

      data = await response.json();
      if (data) {
        setCurrentNavigationPath(path);
      }
      if (data.files) {
        // display directories first, then files
        // within a type (directories or files), display alphabetically
        data.files = data.files.sort((a: FileOrFolder, b: FileOrFolder) => {
          if (a.is_dir === b.is_dir) {
            return a.name.localeCompare(b.name);
          }
          return a.is_dir ? -1 : 1;
        });
        setFiles(data.files as FileOrFolder[]);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        log.error(error.message);
      } else {
        log.error('An unknown error occurred');
      }
    }
  }

  React.useEffect(() => {
    if (currentNavigationPath) {
      const dirArray = makeDirArray(currentNavigationPath);
      setDirArray(dirArray);
    }
  }, [makeDirArray, currentNavigationPath]);

  React.useEffect(() => {
    if (dirArray.length > 1) {
      setCurrentDir(dirArray[dirArray.length - 1]);
    } else {
      setCurrentDir(dirArray[0]);
    }
  }, [dirArray]);

  return (
    <FileBrowserContext.Provider
      value={{
        files,
        currentNavigationPath,
        dirArray,
        currentDir,
        getFileFetchPath,
        setCurrentNavigationPath,
        fetchAndFormatFilesForDisplay
      }}
    >
      {children}
    </FileBrowserContext.Provider>
  );
};
