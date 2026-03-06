import { createContext, useContext } from 'react';
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
  const { fspName, fileBrowserState } = useFileBrowserContext();

  // Use TanStack Query to fetch external bucket and transform to data URL
  // Uses dataLinkPath (tracks propertiesTarget) so the URL updates when
  // the user selects a subdirectory in the file browser
  const externalDataUrlQuery = useExternalDataUrlQuery(
    fspName,
    fileBrowserState.dataLinkPath ?? undefined
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
