import React from 'react';
import toast from 'react-hot-toast';

import {
  useProxiedPathContext,
  type ProxiedPath
} from '@/contexts/ProxiedPathContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { getPreferredPathForDisplay, makeMapKey } from '@/utils';
import type { FileSharePath } from '@/shared.types';
import type { OpenWithToolUrls, PendingToolUrl } from '@/hooks/useZarrMetadata';
import { constructToolUrl } from '@/utils/toolUrls';

export default function useDataToolLinks() {
  const [showDataLinkDialog, setShowDataLinkDialog] =
    React.useState<boolean>(false);
  const {
    createProxiedPath,
    fetchProxiedPath,
    deleteProxiedPath,
    refreshProxiedPaths,
    proxiedPath
  } = useProxiedPathContext();
  const { fileBrowserState } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();
  const { zonesAndFileSharePathsMap } = useZoneAndFspMapContext();

  // Helper function to calculate displayPath
  const getDisplayPath = React.useCallback(() => {
    const fspKey = proxiedPath
      ? makeMapKey('fsp', proxiedPath.fsp_name)
      : fileBrowserState.currentFileSharePath
        ? makeMapKey('fsp', fileBrowserState.currentFileSharePath.name)
        : '';

    const pathFsp = fspKey
      ? (zonesAndFileSharePathsMap[fspKey] as FileSharePath)
      : null;
    const targetPath = proxiedPath
      ? proxiedPath.path
      : fileBrowserState.currentFileOrFolder
        ? fileBrowserState.currentFileOrFolder.path
        : '';

    return pathFsp && targetPath
      ? getPreferredPathForDisplay(pathPreference, pathFsp, targetPath)
      : '';
  }, [
    proxiedPath,
    fileBrowserState.currentFileSharePath,
    fileBrowserState.currentFileOrFolder,
    pathPreference,
    zonesAndFileSharePathsMap
  ]);

  const handlePendingTool = React.useCallback(
    async (
      pendingToolUrl: PendingToolUrl,
      dataUrl: string | undefined,
      urls: OpenWithToolUrls | null,
      handleCopyUrl: ((url: string) => Promise<void>) | undefined,
      setPendingToolUrl:
        | React.Dispatch<React.SetStateAction<PendingToolUrl>>
        | undefined
    ) => {
      if (pendingToolUrl && pendingToolUrl !== 'copy') {
        let navigationUrl = urls?.[pendingToolUrl];

        // If URL not available but we have dataUrl from creating the new proxied path successfully,
        // construct the nagiation URL using the utility function
        if (!navigationUrl && dataUrl) {
          navigationUrl = constructToolUrl(pendingToolUrl, dataUrl);
        }

        if (navigationUrl && setPendingToolUrl) {
          window.open(navigationUrl, '_blank', 'noopener,noreferrer');
          setPendingToolUrl(null);
        } else {
          toast.error('URL not available');
        }
      } else if (pendingToolUrl === 'copy' && dataUrl && handleCopyUrl) {
        await handleCopyUrl(dataUrl);
      }
    },
    []
  );

  const handleCreateDataLink = React.useCallback(
    async (
      pendingToolUrl: PendingToolUrl,
      urls: OpenWithToolUrls | null,
      handleCopyUrl: ((url: string) => Promise<void>) | undefined,
      setPendingToolUrl:
        | React.Dispatch<React.SetStateAction<PendingToolUrl>>
        | undefined
    ) => {
      const displayPath = getDisplayPath();
      // Check if proxied path already exists
      const fetchResult = await fetchProxiedPath();
      if (!fetchResult.success) {
        toast.error(
          `Error checking for existing data link: ${fetchResult.error}`
        );
        return;
      }

      if (fetchResult.data) {
        // Proxied path already exists
        toast.success(`Data link exists for ${displayPath}`);
        const refreshResult = await refreshProxiedPaths();
        if (!refreshResult.success) {
          toast.error(`Error refreshing proxied paths: ${refreshResult.error}`);
          return;
        }
        await handlePendingTool(
          pendingToolUrl,
          fetchResult.data?.url,
          urls,
          handleCopyUrl,
          setPendingToolUrl
        );
      } else {
        // No existing proxied path, create one
        const createProxiedPathResult = await createProxiedPath();
        if (createProxiedPathResult.success) {
          toast.success(`Successfully created data link for ${displayPath}`);
          const refreshResult = await refreshProxiedPaths();
          if (!refreshResult.success) {
            toast.error(
              `Error refreshing proxied paths: ${refreshResult.error}`
            );
            return;
          }
          await handlePendingTool(
            pendingToolUrl,
            createProxiedPathResult.data?.url,
            urls,
            handleCopyUrl,
            setPendingToolUrl
          );
        } else {
          toast.error(
            `Error creating data link: ${createProxiedPathResult.error}`
          );
        }
      }
    },
    [
      createProxiedPath,
      fetchProxiedPath,
      refreshProxiedPaths,
      handlePendingTool,
      getDisplayPath
    ]
  );

  const handleDeleteDataLink = React.useCallback(
    async (proxiedPath: ProxiedPath | null) => {
      const displayPath = getDisplayPath();
      if (!proxiedPath) {
        toast.error('Proxied path not found');
        return;
      }

      const deleteResult = await deleteProxiedPath(proxiedPath);
      if (!deleteResult.success) {
        toast.error(`Error deleting data link: ${deleteResult.error}`);
        return;
      } else {
        toast.success(`Successfully deleted data link for ${displayPath}`);

        const refreshResult = await refreshProxiedPaths();
        if (!refreshResult.success) {
          toast.error(`Error refreshing proxied paths: ${refreshResult.error}`);
          return;
        }
      }
    },
    [deleteProxiedPath, refreshProxiedPaths, getDisplayPath]
  );

  return {
    showDataLinkDialog,
    setShowDataLinkDialog,
    handlePendingTool,
    handleCreateDataLink,
    handleDeleteDataLink
  };
}
