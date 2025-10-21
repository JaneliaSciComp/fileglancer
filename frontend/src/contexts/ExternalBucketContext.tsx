import React from 'react';
import { default as log } from '@/logger';
import { sendFetchRequest } from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

export type ExternalBucket = {
  full_path: string;
  external_url: string;
  fsp_name: string;
  relative_path: string;
};

type ExternalBucketContextType = {
  externalBucket: ExternalBucket | null;
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
  const [externalBucket, setExternalBucket] =
    React.useState<ExternalBucket | null>(null);
  const [externalDataUrl, setExternalDataUrl] = React.useState<string | null>(
    null
  );
  const { fileQuery } = useFileBrowserContext();

  const updateExternalBucket = React.useCallback(
    (bucket: ExternalBucket | null) => {
      setExternalBucket(bucket);

      if (bucket) {
        if (!fileQuery.data.currentFileSharePath) {
          throw new Error('No file share path selected');
        }
        if (!fileQuery.data.currentFileOrFolder) {
          throw new Error('No folder selected');
        }
        // Check if current path is an ancestor of the bucket path
        if (
          fileQuery.data.currentFileSharePath.name === bucket.fsp_name &&
          fileQuery.data.currentFileOrFolder.path.startsWith(
            bucket.relative_path
          )
        ) {
          // Create data URL with relative path from bucket
          const relativePath =
            fileQuery.data.currentFileOrFolder.path.substring(
              bucket.relative_path.length
            );
          const cleanRelativePath = relativePath.startsWith('/')
            ? relativePath.substring(1)
            : relativePath;
          const externalUrl = bucket.external_url.endsWith('/')
            ? bucket.external_url.slice(0, -1)
            : bucket.external_url;
          setExternalDataUrl(`${externalUrl}/${cleanRelativePath}/`);
        } else {
          setExternalDataUrl(null);
        }
      } else {
        setExternalDataUrl(null);
      }
    },
    [fileQuery.data.currentFileOrFolder, fileQuery.data.currentFileSharePath]
  );

  const fetchExternalBucket = React.useCallback(async () => {
    if (!fileQuery.data.currentFileSharePath) {
      log.trace('No current file share path selected');
      return null;
    }
    try {
      const response = await sendFetchRequest(
        `/api/external-buckets/${fileQuery.data.currentFileSharePath.name}`,
        'GET'
      );
      if (!response.ok) {
        if (response.status === 404) {
          log.debug('No external bucket found for FSP');
          return null;
        }
        log.error(
          `Failed to fetch external bucket: ${response.status} ${response.statusText}`
        );
        return null;
      }
      const data = (await response.json()) as any;
      if (data?.buckets) {
        return data.buckets[0] as ExternalBucket;
      } else {
        log.error('No buckets found in response');
        return null;
      }
    } catch (error) {
      log.error('Error fetching external bucket:', error);
    }
    return null;
  }, [fileQuery.data.currentFileSharePath]);

  React.useEffect(() => {
    (async function () {
      try {
        const bucket = await fetchExternalBucket();
        updateExternalBucket(bucket);
      } catch (error) {
        log.error('Error in useEffect:', error);
        updateExternalBucket(null);
      }
    })();
  }, [
    fileQuery.data.currentFileSharePath,
    fileQuery.data.currentFileOrFolder,
    fetchExternalBucket,
    updateExternalBucket
  ]);

  return (
    <ExternalBucketContext.Provider
      value={{
        externalBucket,
        externalDataUrl
      }}
    >
      {children}
    </ExternalBucketContext.Provider>
  );
};

export default ExternalBucketContext;
