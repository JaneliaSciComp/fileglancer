import React from 'react';

import { default as log } from '@/logger';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { sendFetchRequest } from '@/utils';
import type { Result } from '@/shared.types';
import {
  createSuccess,
  getResponseError,
  handleBadResponse,
  handleError
} from '@/utils/errorHandling';

export type ProxiedPath = {
  username: string;
  sharing_key: string;
  sharing_name: string;
  path: string;
  fsp_name: string;
  created_at: string;
  updated_at: string;
  url: string;
};

type ProxiedPathContextType = {
  proxiedPath: ProxiedPath | null;
  dataUrl: string | null;
  allProxiedPaths?: ProxiedPath[];
  createProxiedPath: () => Promise<Result<void>>;
  deleteProxiedPath: (proxiedPath: ProxiedPath) => Promise<void>;
};

function sortProxiedPathsByDate(paths: ProxiedPath[]): ProxiedPath[] {
  return paths.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

const ProxiedPathContext = React.createContext<ProxiedPathContextType | null>(
  null
);

export const useProxiedPathContext = () => {
  const context = React.useContext(ProxiedPathContext);
  if (!context) {
    throw new Error(
      'useProxiedPathContext must be used within a ProxiedPathProvider'
    );
  }
  return context;
};

export const ProxiedPathProvider = ({
  children
}: {
  children: React.ReactNode;
}) => {
  const [allProxiedPaths, setAllProxiedPaths] = React.useState<ProxiedPath[]>(
    []
  );
  const [proxiedPath, setProxiedPath] = React.useState<ProxiedPath | null>(
    null
  );
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const { cookies } = useCookiesContext();
  const { fileBrowserState } = useFileBrowserContext();

  const updateProxiedPath = React.useCallback(
    (proxiedPath: ProxiedPath | null) => {
      log.debug('updateProxiedPath', proxiedPath);
      setProxiedPath(proxiedPath);
      if (proxiedPath) {
        setDataUrl(proxiedPath.url);
      } else {
        setDataUrl(null);
      }
    },
    []
  );

  const fetchAllProxiedPaths = React.useCallback(async (): Promise<void> => {
    const response = await sendFetchRequest(
      '/api/fileglancer/proxied-path',
      'GET',
      cookies['_xsrf']
    );

    if (!response.ok) {
      const error = getResponseError(response);
      throw new Error(
        `Error fetching proxied paths: ${response.status}: ${error} `
      );
    }

    const data = await response.json();
    if (data?.paths) {
      setAllProxiedPaths(sortProxiedPathsByDate(data.paths) as ProxiedPath[]);
    }
  }, [cookies]);

  const fetchProxiedPath = React.useCallback(async () => {
    if (!fileBrowserState.currentFileSharePath || !fileBrowserState.currentFolder) {
      log.trace('No current file share path or file/folder selected');
      return null;
    }
    try {
      const response = await sendFetchRequest(
        `/api/fileglancer/proxied-path?fsp_name=${fileBrowserState.currentFileSharePath?.name}&path=${fileBrowserState.currentFolder?.path}`,
        'GET',
        cookies['_xsrf']
      );
      if (!response.ok) {
        log.error(
          `Failed to fetch proxied path: ${response.status} ${response.statusText}`
        );
        return null;
      }
      const data = (await response.json()) as any;
      if (data?.paths) {
        return data.paths[0] as ProxiedPath;
      }
    } catch (error) {
      log.error('Error fetching proxied path:', error);
    }
    return null;
  }, [fileBrowserState.currentFileSharePath, fileBrowserState.currentFolder, cookies]);

  async function createProxiedPath(): Promise<Result<void>> {
    if (!fileBrowserState.currentFileSharePath){
      return handleError(new Error('No file share path selected'))
    } else if (!fileBrowserState.currentFolder){  
      return handleError(new Error('No folder selected'))
    } 

    try {
      const response = await sendFetchRequest(
        '/api/fileglancer/proxied-path',
        'POST',
        cookies['_xsrf'],
        { fsp_name: fileBrowserState.currentFileSharePath.name, path: fileBrowserState.currentFolder.path }
      );

      if (response.ok) {
        const proxiedPath = (await response.json()) as ProxiedPath;
        updateProxiedPath(proxiedPath);
        await fetchAllProxiedPaths();
        log.debug('Created proxied path:', proxiedPath);
      } else {
        return handleBadResponse(response);
      }
    } catch (error) {
      return handleError(error);
    }
    return createSuccess();
  }

  const deleteProxiedPath = React.useCallback(
    async (proxiedPath: ProxiedPath) => {
      const response = await sendFetchRequest(
        `/api/fileglancer/proxied-path?sharing_key=${proxiedPath.sharing_key}`,
        'DELETE',
        cookies['_xsrf']
      );
      if (!response.ok) {
        throw new Error(
          `Failed to delete proxied path: ${response.status} ${response.statusText}`
        );
      }
      log.debug('Deleted proxied path:', proxiedPath);
      updateProxiedPath(null);
      await fetchAllProxiedPaths();
    },
    [cookies, updateProxiedPath, fetchAllProxiedPaths]
  );

  React.useEffect(() => {
    (async function () {
      try {
        await fetchAllProxiedPaths();
      } catch (error) {
        log.error(error);
      }
    })();
  }, [fetchAllProxiedPaths]);

  React.useEffect(() => {
    (async function () {
      try {
        const path = await fetchProxiedPath();
        if (path) {
          updateProxiedPath(path);
        } else {
          updateProxiedPath(null);
        }
      } catch (error) {
        log.error('Error in useEffect:', error);
      }
    })();
  }, [
    fileBrowserState.currentFileSharePath,
    fileBrowserState.currentFolder,
    fetchProxiedPath,
    updateProxiedPath
  ]);

  return (
    <ProxiedPathContext.Provider
      value={{
        proxiedPath,
        dataUrl,
        allProxiedPaths,
        createProxiedPath,
        deleteProxiedPath
      }}
    >
      {children}
    </ProxiedPathContext.Provider>
  );
};

export default ProxiedPathContext;
