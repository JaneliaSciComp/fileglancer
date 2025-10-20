import React from 'react';
import toast from 'react-hot-toast';

import {
  useProxiedPathContext,
  type ProxiedPath
} from '@/contexts/ProxiedPathContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';

import { copyToClipboard } from '@/utils/copyText';
import type { Result } from '@/shared.types';
import type { OpenWithToolUrls, PendingToolKey } from '@/hooks/useZarrMetadata';

// Overload for ZarrPreview usage with required parameters
export default function useDataToolLinks(
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>,
  openWithToolUrls: OpenWithToolUrls | null,
  pendingToolKey: PendingToolKey,
  setPendingToolKey: React.Dispatch<React.SetStateAction<PendingToolKey>>
): {
  handleCreateDataLink: () => Promise<Result<void | ProxiedPath[]>>;
  handleDeleteDataLink: (proxiedPath: ProxiedPath) => Promise<void>;
  handleToolClick: (toolKey: PendingToolKey) => Promise<void>;
  handleDialogConfirm: () => Promise<void>;
  handleDialogCancel: () => void;
  showCopiedTooltip: boolean;
};

// Overload for linksColumns and PropertiesDrawer usage with only one param
export default function useDataToolLinks(
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>
): {
  handleCreateDataLink: () => Promise<Result<void | ProxiedPath[]>>;
  handleDeleteDataLink: (proxiedPath: ProxiedPath) => Promise<void>;
  handleToolClick: (toolKey: PendingToolKey) => Promise<void>;
  handleDialogConfirm: () => Promise<void>;
  handleDialogCancel: () => void;
  showCopiedTooltip: boolean;
};

export default function useDataToolLinks(
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>,
  openWithToolUrls?: OpenWithToolUrls | null,
  pendingToolKey?: PendingToolKey,
  setPendingToolKey?: React.Dispatch<React.SetStateAction<PendingToolKey>>
) {
  const [showCopiedTooltip, setShowCopiedTooltip] = React.useState(false);

  // Store current URLs in a ref to avoid stale closure issues
  const currentUrlsRef = React.useRef(openWithToolUrls);
  currentUrlsRef.current = openWithToolUrls;

  const {
    createProxiedPath,
    deleteProxiedPath,
    refreshProxiedPaths,
    proxiedPath
  } = useProxiedPathContext();

  const { areDataLinksAutomatic } = usePreferencesContext();
  const { externalDataUrl } = useExternalBucketContext();

  const handleCopy = async (url: string): Promise<void> => {
    const result = await copyToClipboard(url);
    if (result.success) {
      setShowCopiedTooltip(true);
      setTimeout(() => setShowCopiedTooltip(false), 2000);
    } else {
      toast.error('Failed to copy URL to clipboard');
    }
  };

  const handleCreateDataLink = async (): Promise<
    Result<void | ProxiedPath[]>
  > => {
    const createProxiedPathResult = await createProxiedPath();
    if (createProxiedPathResult.success) {
      toast.success('Data link created successfully');
    } else if (createProxiedPathResult.error) {
      toast.error(`Error creating data link: ${createProxiedPathResult.error}`);
    }
    return await refreshProxiedPaths();
  };

  const executeToolAction = async (
    toolKey: PendingToolKey,
    urls: OpenWithToolUrls
  ) => {
    if (!urls) {
      return;
    }
    if (toolKey === 'copy') {
      await handleCopy(urls.copy);
    } else if (toolKey) {
      const navigationUrl = urls[toolKey];
      if (navigationUrl) {
        window.open(navigationUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('URL not available');
      }
    }
    setPendingToolKey?.(null);
  };

  const createLinkAndExecuteAction = async (
    clickedToolKey?: PendingToolKey
  ) => {
    const toolKey = clickedToolKey || pendingToolKey;
    if (!toolKey) {
      return;
    }
    const result = await handleCreateDataLink();
    if (result.success) {
      // Wait for URLs to be updated and use ref to get current value
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds max

      while (attempts < maxAttempts) {
        const currentUrls = currentUrlsRef.current;

        if (currentUrls && currentUrls.copy && currentUrls.copy !== '') {
          await executeToolAction(toolKey, currentUrls);
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (attempts >= maxAttempts) {
        toast.error(
          `${toolKey === 'copy' ? 'Error copying data link' : `Error navigating to ${toolKey}`}`
        );
      }
    } else if (result.error) {
      toast.error(`Error refreshing links: ${result.error}`);
    }
  };

  const handleToolClick = async (toolKey: PendingToolKey) => {
    if (!proxiedPath && !externalDataUrl) {
      if (areDataLinksAutomatic) {
        await createLinkAndExecuteAction(toolKey);
      } else {
        setPendingToolKey?.(toolKey);
        setShowDataLinkDialog?.(true);
      }
    } else if ((proxiedPath || externalDataUrl) && openWithToolUrls) {
      await executeToolAction(toolKey, openWithToolUrls);
    }
  };

  // First case is for link creation through a data tool button click
  // Second case is for link creation through the PropertiesDrawer dialog
  const handleDialogConfirm = async () => {
    if (pendingToolKey) {
      await createLinkAndExecuteAction();
    } else {
      await handleCreateDataLink();
    }
    setShowDataLinkDialog?.(false);
  };

  const handleDialogCancel = () => {
    setPendingToolKey?.(null);
    setShowDataLinkDialog(false);
  };

  const handleDeleteDataLink = async (proxiedPath: ProxiedPath) => {
    if (!proxiedPath) {
      toast.error('Proxied path not found');
      return;
    }

    const deleteResult = await deleteProxiedPath(proxiedPath);
    if (!deleteResult.success) {
      toast.error(`Error deleting data link: ${deleteResult.error}`);
      return;
    } else {
      toast.success(`Successfully deleted data link`);

      const refreshResult = await refreshProxiedPaths();
      if (!refreshResult.success) {
        toast.error(`Error refreshing proxied paths: ${refreshResult.error}`);
        return;
      }
    }
  };

  return {
    handleCreateDataLink,
    handleDeleteDataLink,
    handleToolClick,
    handleDialogConfirm,
    handleDialogCancel,
    showCopiedTooltip
  };
}
