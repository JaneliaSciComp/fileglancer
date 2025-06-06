import React from 'react';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { sendFetchRequest } from '@/utils';
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
  const { currentFileOrFolder, currentFileSharePath } = useFileBrowserContext();

  const updateProxiedPath = React.useCallback(
    (proxiedPath: ProxiedPath | null) => {
      setProxiedPath(proxiedPath);
      if (proxiedPath) {
        setDataUrl(
          `${proxyBaseUrl}/${proxiedPath.sharing_key}/${proxiedPath.sharing_name}`
        );
      } else {
        setDataUrl(null);
      }
    },
    []
  );

  const fetchProxiedPath = React.useCallback(async () => {
    if (!currentFileSharePath || !currentFileOrFolder) {
      console.error('No current file share path or file/folder selected');
      return null;
    }
    try {
      const response = await sendFetchRequest(
        `/api/fileglancer/proxied-path?fsp_mount_path=${currentFileSharePath.mount_path}&path=${currentFileOrFolder.path}`,
        'GET',
        cookies['_xsrf']
      );
      if (!response.ok) {
        console.error(
          `Failed to fetch proxied path: ${response.status} ${response.statusText}`
        );
        return null;
      }
      const data = (await response.json()) as any;
      if (data?.paths) {
        return data.paths[0] as ProxiedPath;
      }
    } catch (error) {
      console.error('Error fetching proxied path:', error);
    }
    return null;
  }, [cookies, currentFileSharePath, currentFileOrFolder]);

  const createProxiedPath = React.useCallback(
    async (fspMountPath: string, path: string) => {
      const response = await sendFetchRequest(
        '/api/fileglancer/proxied-path',
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
      console.log('Created proxied path:', proxiedPath);
      return proxiedPath;
    },
    [updateProxiedPath, cookies]
  );

  const deleteProxiedPath = React.useCallback(async () => {
    if (!proxiedPath) {
      console.error('No proxied path to delete');
      return;
    }
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
    console.log('Deleted proxied path:', proxiedPath);
    updateProxiedPath(null);
  }, [updateProxiedPath, proxiedPath, cookies]);

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
        console.error('Error in useEffect:', error);
      }
    })();
  }, [
    currentFileSharePath,
    currentFileOrFolder,
    fetchProxiedPath,
    updateProxiedPath
  ]);

  return (
    <ProxiedPathContext.Provider
      value={{ proxiedPath, dataUrl, createProxiedPath, deleteProxiedPath }}
    >
      {children}
    </ProxiedPathContext.Provider>
  );
};

export default ProxiedPathContext;
