import React from 'react';

import { default as log } from '@/logger';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { sendFetchRequest } from '@/utils';
import type { Result } from '@/shared.types';
import { createSuccess, handleError, toHttpError } from '@/utils/errorHandling';

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
  allProxiedPaths: ProxiedPath[];
  loadingProxiedPaths: boolean;
  createProxiedPath: () => Promise<Result<ProxiedPath | void>>;
  deleteProxiedPath: (proxiedPath: ProxiedPath) => Promise<Result<void>>;
  refreshProxiedPaths: () => Promise<Result<ProxiedPath[] | void>>;
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
  readonly children: React.ReactNode;
}) => {
  const [allProxiedPaths, setAllProxiedPaths] = React.useState<ProxiedPath[]>(
    []
  );
  const [loadingProxiedPaths, setLoadingProxiedPaths] =
    React.useState<boolean>(false);
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

  const fetchAllProxiedPaths = React.useCallback(async (): Promise<
    Result<ProxiedPath[] | void>
  > => {
    const response = await sendFetchRequest(
      '/api/fileglancer/proxied-path',
      'GET',
      cookies['_xsrf']
    );

    if (!response.ok) {
      throw await toHttpError(response);
    }

    const data = await response.json();
    if (data?.paths) {
      return createSuccess(sortProxiedPathsByDate(data.paths as ProxiedPath[]));
    } else {
      return createSuccess(undefined);
    }
  }, [cookies]);

  const refreshProxiedPaths = async (): Promise<Result<void>> => {
    setLoadingProxiedPaths(true);
    try {
      const result = await fetchAllProxiedPaths();
      if (result.success && result.data) {
        setAllProxiedPaths(result.data as ProxiedPath[]);
      }
      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    } finally {
      setLoadingProxiedPaths(false);
    }
  };

  const fetchProxiedPath = React.useCallback(async (): Promise<
    Result<ProxiedPath | void>
  > => {
    if (
      !fileBrowserState.currentFileSharePath ||
      !fileBrowserState.currentFileOrFolder
    ) {
      log.debug(
        'fetchProxiedPath - no current file share path or file/folder selected'
      );
      return createSuccess(undefined);
    }
    try {
      const response = await sendFetchRequest(
        `/api/fileglancer/proxied-path?fsp_name=${fileBrowserState.currentFileSharePath.name}&path=${fileBrowserState.currentFileOrFolder.path}`,
        'GET',
        cookies['_xsrf']
      );
      if (!response.ok && response.status !== 404) {
        log.warn(
          `No proxied path found for fsp ${fileBrowserState.currentFileSharePath.name} and path ${fileBrowserState.currentFileOrFolder.path}: ${response.status} ${response.statusText}`
        );
        // This is not an error, just no proxied path found for this fsp/path
        return createSuccess(undefined);
      } else if (!response.ok) {
        throw await toHttpError(response);
      }
      const data = (await response.json()) as any;
      if (data?.paths) {
        return createSuccess(data.paths[0] as ProxiedPath);
      } else {
        return createSuccess(undefined);
      }
    } catch (error) {
      return handleError(error);
    }
  }, [
    fileBrowserState.currentFileSharePath,
    fileBrowserState.currentFileOrFolder,
    cookies
  ]);

  async function createProxiedPath(): Promise<Result<ProxiedPath | void>> {
    if (!fileBrowserState.currentFileSharePath) {
      return handleError(new Error('No file share path selected'));
    } else if (!fileBrowserState.currentFileOrFolder) {
      return handleError(new Error('No folder selected'));
    }

    try {
      const response = await sendFetchRequest(
        '/api/fileglancer/proxied-path',
        'POST',
        cookies['_xsrf'],
        {
          fsp_name: fileBrowserState.currentFileSharePath.name,
          path: fileBrowserState.currentFileOrFolder.path
        }
      );

      if (response.ok) {
        const proxiedPath = (await response.json()) as ProxiedPath;
        updateProxiedPath(proxiedPath);
        return createSuccess(proxiedPath);
      } else {
        throw await toHttpError(response);
      }
    } catch (error) {
      return handleError(error);
    }
  }

  const deleteProxiedPath = React.useCallback(
    async (proxiedPath: ProxiedPath): Promise<Result<void>> => {
      try {
        const response = await sendFetchRequest(
          `/api/fileglancer/proxied-path?sharing_key=${proxiedPath.sharing_key}`,
          'DELETE',
          cookies['_xsrf']
        );
        if (!response.ok) {
          throw await toHttpError(response);
        } else {
          updateProxiedPath(null);
          return createSuccess(undefined);
        }
      } catch (error) {
        return handleError(error);
      }
    },
    [cookies, updateProxiedPath]
  );

  React.useEffect(() => {
    (async function () {
      setLoadingProxiedPaths(true);
      const result = await fetchAllProxiedPaths();
      if (result.success && result.data) {
        setAllProxiedPaths(result.data as ProxiedPath[]);
        setLoadingProxiedPaths(false);
      } else {
        setLoadingProxiedPaths(false);
      }
    })();
  }, [fetchAllProxiedPaths]);

  React.useEffect(() => {
    (async function () {
      const result = await fetchProxiedPath();
      if (result.success && result.data) {
        updateProxiedPath(result.data);
      } else {
        updateProxiedPath(null);
      }
    })();
  }, [
    fileBrowserState.currentFileSharePath,
    fileBrowserState.currentFileOrFolder,
    fetchProxiedPath,
    updateProxiedPath
  ]);

  return (
    <ProxiedPathContext.Provider
      value={{
        proxiedPath,
        dataUrl,
        allProxiedPaths,
        loadingProxiedPaths,
        createProxiedPath,
        deleteProxiedPath,
        refreshProxiedPaths
      }}
    >
      {children}
    </ProxiedPathContext.Provider>
  );
};

export default ProxiedPathContext;
