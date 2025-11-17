import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import {
  useAllProxiedPathsQuery,
  useProxiedPathByFspAndPathQuery,
  useCreateProxiedPathMutation,
  useDeleteProxiedPathMutation
} from '@/queries/proxiedPathQueries';

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
  allProxiedPathsQuery: ReturnType<typeof useAllProxiedPathsQuery>;
  proxiedPathByFspAndPathQuery: ReturnType<
    typeof useProxiedPathByFspAndPathQuery
  >;
  createProxiedPathMutation: ReturnType<typeof useCreateProxiedPathMutation>;
  deleteProxiedPathMutation: ReturnType<typeof useDeleteProxiedPathMutation>;
};

const ProxiedPathContext = createContext<ProxiedPathContextType | null>(null);

export const useProxiedPathContext = () => {
  const context = useContext(ProxiedPathContext);
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
  readonly children: ReactNode;
}) => {
  const { fileQuery } = useFileBrowserContext();

  // Initialize all queries and mutations
  const allProxiedPathsQuery = useAllProxiedPathsQuery();
  const proxiedPathByFspAndPathQuery = useProxiedPathByFspAndPathQuery(
    fileQuery.data?.currentFileSharePath?.name,
    fileQuery.data?.currentFileOrFolder?.path,
    !fileQuery.isPending && !fileQuery.isError
  );
  const createProxiedPathMutation = useCreateProxiedPathMutation();
  const deleteProxiedPathMutation = useDeleteProxiedPathMutation();

  const value: ProxiedPathContextType = {
    allProxiedPathsQuery,
    proxiedPathByFspAndPathQuery,
    createProxiedPathMutation,
    deleteProxiedPathMutation
  };

  return (
    <ProxiedPathContext.Provider value={value}>
      {children}
    </ProxiedPathContext.Provider>
  );
};

export default ProxiedPathContext;
