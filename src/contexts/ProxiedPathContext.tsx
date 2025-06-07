import React from 'react';
import { default as log } from '@/logger';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { getAPIPathRoot, sendFetchRequest } from '@/utils';
import { useZoneBrowserContext } from './ZoneBrowserContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

const proxyBaseUrl = import.meta.env.VITE_PROXY_BASE_URL;

type ProxiedPath = {
  fsp_mount_path: string;
  path: string;
  sharing_key: string;
  sharing_name: string;
  username: string;
};

type ProxiedPathContextType = {
  proxiedPath: ProxiedPath | null;
  dataUrl: string | null;
  createProxiedPath: (
    fspMountPath: string,
    path: string
  ) => Promise<ProxiedPath | null>;
  deleteProxiedPath: () => Promise<void>;
};

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
  const [proxiedPath, setProxiedPath] = React.useState<ProxiedPath | null>(
    null
  );
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const { cookies } = useCookiesContext();
  const { currentFileSharePath } = useZoneBrowserContext();
  const { currentNavigationPath } = useFileBrowserContext();

  function updateProxiedPath(proxiedPath: ProxiedPath | null) {
    setProxiedPath(proxiedPath);
    if (proxiedPath) {
      setDataUrl(
        `${proxyBaseUrl}/${proxiedPath.sharing_key}/${proxiedPath.sharing_name}`
      );
    } else {
      setDataUrl(null);
    }
  }

  async function fetchProxiedPath(): Promise<ProxiedPath | null> {
    try {
      const filePath = currentNavigationPath.replace('?subpath=', '/');
      const filePathWithoutFsp = filePath.split('/').slice(1).join('/');
      log.debug('Fetching proxied path for', currentFileSharePath?.mount_path, filePathWithoutFsp);
      const response = await sendFetchRequest(
        `${getAPIPathRoot()}api/fileglancer/proxied-path?fsp_mount_path=${currentFileSharePath?.mount_path}&path=${filePathWithoutFsp}`,
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
  }

  async function createProxiedPath(
    fspMountPath: string,
    path: string
  ): Promise<ProxiedPath | null> {
    const response = await sendFetchRequest(
      `${getAPIPathRoot()}api/fileglancer/proxied-path`,
      'POST',
      cookies['_xsrf'],
      { fsp_mount_path: fspMountPath, path: path }
    );
    if (!response.ok) {
      throw new Error(
        `Failed to create proxied path: ${response.status} ${response.statusText}`
      );
    }
    const proxiedPath = (await response.json()) as ProxiedPath;
    updateProxiedPath(proxiedPath);
    log.debug('Created proxied path:', proxiedPath);
    return proxiedPath;
  }

  async function deleteProxiedPath(): Promise<void> {
    if (!proxiedPath) {
      log.error('No proxied path to delete');
      return;
    }
    const response = await sendFetchRequest(
      `${getAPIPathRoot()}api/fileglancer/proxied-path?sharing_key=${proxiedPath.sharing_key}`,
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
  }

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
  }, [currentFileSharePath, currentNavigationPath]);

  return (
    <ProxiedPathContext.Provider
      value={{ proxiedPath, dataUrl, createProxiedPath, deleteProxiedPath }}
    >
      {children}
    </ProxiedPathContext.Provider>
  );
};

export default ProxiedPathContext;
