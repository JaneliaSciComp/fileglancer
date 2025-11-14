import { useState, useRef, SetStateAction } from 'react';
import type { Dispatch } from 'react';
import toast from 'react-hot-toast';

import {
  useProxiedPathContext,
  type ProxiedPath
} from '@/contexts/ProxiedPathContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

import { copyToClipboard } from '@/utils/copyText';
import type { OpenWithToolUrls, PendingToolKey } from '@/hooks/useZarrMetadata';

export function getNeuroglancerUrlAndKey(
  urls: OpenWithToolUrls | null,
  selectedZarrVersion: 2 | 3 | null
): { url: string | null; key: 'neuroglancerV2' | 'neuroglancerV3' } {
  if (!urls) {
    return { url: null, key: 'neuroglancerV2' };
  }

  const hasV2 = urls.neuroglancerV2 !== null;
  const hasV3 = urls.neuroglancerV3 !== null;

  if (hasV2 && hasV3) {
    // Both available: use selectedZarrVersion if set, otherwise default to v3
    const version = selectedZarrVersion === 2 ? 2 : 3;
    const url = version === 2 ? urls.neuroglancerV2 : urls.neuroglancerV3;
    return {
      url,
      key: version === 2 ? 'neuroglancerV2' : 'neuroglancerV3'
    };
  } else if (hasV2) {
    // Only v2 available
    return { url: urls.neuroglancerV2, key: 'neuroglancerV2' };
  } else if (hasV3) {
    // Only v3 available
    return { url: urls.neuroglancerV3, key: 'neuroglancerV3' };
  } else {
    // Neither available - check if both are empty strings (pending) or both null
    const url =
      urls.neuroglancerV2 === '' || urls.neuroglancerV3 === '' ? '' : null;
    return { url, key: 'neuroglancerV3' };
  }
}

// Overload for ZarrPreview usage with required parameters
export default function useDataToolLinks(
  setShowDataLinkDialog: Dispatch<SetStateAction<boolean>>,
  openWithToolUrls: OpenWithToolUrls | null,
  pendingToolKey: PendingToolKey,
  setPendingToolKey: Dispatch<SetStateAction<PendingToolKey>>
): {
  handleCreateDataLink: () => Promise<void>;
  handleDeleteDataLink: (proxiedPath: ProxiedPath) => Promise<void>;
  handleToolClick: (toolKey: PendingToolKey) => Promise<void>;
  handleDialogConfirm: () => Promise<void>;
  handleDialogCancel: () => void;
  showCopiedTooltip: boolean;
};

// Overload for linksColumns and PropertiesDrawer usage with only one param
export default function useDataToolLinks(
  setShowDataLinkDialog: Dispatch<SetStateAction<boolean>>
): {
  handleCreateDataLink: () => Promise<void>;
  handleDeleteDataLink: (proxiedPath: ProxiedPath) => Promise<void>;
  handleToolClick: (toolKey: PendingToolKey) => Promise<void>;
  handleDialogConfirm: () => Promise<void>;
  handleDialogCancel: () => void;
  showCopiedTooltip: boolean;
};

export default function useDataToolLinks(
  setShowDataLinkDialog: Dispatch<SetStateAction<boolean>>,
  openWithToolUrls?: OpenWithToolUrls | null,
  pendingToolKey?: PendingToolKey,
  setPendingToolKey?: Dispatch<SetStateAction<PendingToolKey>>
) {
  const [showCopiedTooltip, setShowCopiedTooltip] = useState(false);

  // Store current URLs in a ref to avoid stale closure issues
  const currentUrlsRef = useRef(openWithToolUrls);
  currentUrlsRef.current = openWithToolUrls;

  const { fileBrowserState, fileQuery } = useFileBrowserContext();
  const {
    createProxiedPathMutation,
    deleteProxiedPathMutation,
    allProxiedPathsQuery,
    proxiedPathByFspAndPathQuery
  } = useProxiedPathContext();

  const { areDataLinksAutomatic } = usePreferencesContext();
  const { externalDataUrlQuery } = useExternalBucketContext();

  const handleCopy = async (url: string): Promise<void> => {
    const result = await copyToClipboard(url);
    if (result.success) {
      setShowCopiedTooltip(true);
      setTimeout(() => setShowCopiedTooltip(false), 2000);
    } else {
      toast.error('Failed to copy URL to clipboard');
    }
  };

  const handleCreateDataLink = async (): Promise<void> => {
    if (!fileBrowserState.uiFileSharePath) {
      toast.error('No file share path selected');
      return;
    }
    if (!fileQuery.data?.currentFileOrFolder) {
      toast.error('No folder selected');
      return;
    }

    try {
      await createProxiedPathMutation.mutateAsync({
        fsp_name: fileBrowserState.uiFileSharePath.name,
        path: fileQuery.data.currentFileOrFolder.path
      });
      toast.success('Data link created successfully');
      await allProxiedPathsQuery.refetch();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Error creating data link: ${errorMessage}`);
    }
  };

  const executeToolAction = async (
    toolKey: PendingToolKey,
    urls: OpenWithToolUrls
  ) => {
    if (!urls) {
      return;
    }

    try {
      if (toolKey === 'copy') {
        await handleCopy(urls.copy);
      } else if (toolKey) {
        const navigationUrl = urls[toolKey];

        if (navigationUrl) {
          // Create anchor element and simulate click to open URL
          // This is more reliable than window.open and doesn't trigger DevTools errors
          const link = document.createElement('a');
          link.href = navigationUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          toast.error('URL not available');
        }
      }
      setPendingToolKey?.(null);
    } catch (error) {
      // Don't re-throw if it's just a window.open issue - the action already succeeded
      // Only show a toast if this is a real application error
      if (error instanceof Error && !error.message.includes('window.open')) {
        toast.error(`Failed to open ${toolKey}: ${error.message}`);
      }
    }
  };

  const createLinkAndExecuteAction = async (
    clickedToolKey?: PendingToolKey
  ) => {
    const toolKey = clickedToolKey || pendingToolKey;
    if (!toolKey) {
      return;
    }
    await handleCreateDataLink();

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
  };

  const handleToolClick = async (toolKey: PendingToolKey) => {
    if (!proxiedPathByFspAndPathQuery.data && !externalDataUrlQuery.data) {
      if (areDataLinksAutomatic) {
        await createLinkAndExecuteAction(toolKey);
      } else {
        setPendingToolKey?.(toolKey);
        setShowDataLinkDialog?.(true);
      }
    } else if (
      (proxiedPathByFspAndPathQuery.data || externalDataUrlQuery.data) &&
      openWithToolUrls
    ) {
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

    try {
      await deleteProxiedPathMutation.mutateAsync({
        sharing_key: proxiedPath.sharing_key
      });
      toast.success('Successfully deleted data link');
      await allProxiedPathsQuery.refetch();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Error deleting data link: ${errorMessage}`);
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
