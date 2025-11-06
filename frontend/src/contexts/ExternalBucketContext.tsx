import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import {
  useExternalDataUrlQuery,
  type ExternalBucket
} from '@/queries/externalBucketQueries';

export type { ExternalBucket };

type ExternalBucketContextType = {
  externalDataUrlQuery: UseQueryResult<string | null, Error>;
};

const ExternalBucketContext = createContext<ExternalBucketContextType | null>(
  null
);

export const useExternalBucketContext = () => {
  const context = useContext(ExternalBucketContext);
  if (!context) {
    throw new Error(
      'useExternalBucketContext must be used within an ExternalBucketProvider'
    );
  }
  return context;
};

export const ExternalBucketProvider = ({
  children
}: {
  readonly children: ReactNode;
}) => {
  const { fileQuery, fileBrowserState } = useFileBrowserContext();

  // Use TanStack Query to fetch external bucket and transform to data URL
  // Second parameter is conditions required to enable the query
  const externalDataUrlQuery = useExternalDataUrlQuery(
    fileBrowserState.uiFileSharePath?.name,
    fileQuery.data?.currentFileOrFolder?.path,
    !fileQuery.isPending && !!fileBrowserState.uiFileSharePath
  );

  return (
    <ExternalBucketContext.Provider
      value={{
        externalDataUrlQuery
      }}
    >
      {children}
    </ExternalBucketContext.Provider>
  );
};

export default ExternalBucketContext;
