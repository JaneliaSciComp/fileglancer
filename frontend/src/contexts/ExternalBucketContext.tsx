import React from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import {
  useExternalBucketQuery,
  type ExternalBucket
} from '@/queries/externalBucketQueries';

export type { ExternalBucket };

type ExternalBucketContextType = {
  externalBucketQuery: UseQueryResult<ExternalBucket | null, Error>;
  externalDataUrl: string | null;
};

const ExternalBucketContext =
  React.createContext<ExternalBucketContextType | null>(null);

export const useExternalBucketContext = () => {
  const context = React.useContext(ExternalBucketContext);
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
  readonly children: React.ReactNode;
}) => {
  const { fileQuery, fileBrowserState } = useFileBrowserContext();

  // Use TanStack Query to fetch external bucket
  // Second parameter is conditions required to enable the query
  const externalBucketQuery = useExternalBucketQuery(
    fileBrowserState.uiFileSharePath?.name,
    !fileQuery.isPending && !!fileBrowserState.uiFileSharePath
  );

  // Compute external data URL based on query data
  const externalDataUrl = React.useMemo(() => {
    const bucket = externalBucketQuery.data;

    if (!bucket || !fileQuery.data) {
      return null;
    }

    if (!fileBrowserState.uiFileSharePath) {
      return null;
    }

    if (!fileQuery.data.currentFileOrFolder) {
      return null;
    }

    // Check if current path is an ancestor of the bucket path
    if (
      fileBrowserState.uiFileSharePath.name === bucket.fsp_name &&
      fileQuery.data.currentFileOrFolder.path.startsWith(bucket.relative_path)
    ) {
      // Create data URL with relative path from bucket
      const relativePath = fileQuery.data.currentFileOrFolder.path.substring(
        bucket.relative_path.length
      );
      const cleanRelativePath = relativePath.startsWith('/')
        ? relativePath.substring(1)
        : relativePath;
      const externalUrl = bucket.external_url.endsWith('/')
        ? bucket.external_url.slice(0, -1)
        : bucket.external_url;
      return `${externalUrl}/${cleanRelativePath}/`;
    }

    return null;
  }, [
    externalBucketQuery.data,
    fileQuery.data,
    fileBrowserState.uiFileSharePath
  ]);

  return (
    <ExternalBucketContext.Provider
      value={{
        externalBucketQuery,
        externalDataUrl
      }}
    >
      {children}
    </ExternalBucketContext.Provider>
  );
};

export default ExternalBucketContext;
