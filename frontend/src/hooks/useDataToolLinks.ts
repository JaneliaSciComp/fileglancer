import { useRef, SetStateAction } from 'react';
import type { Dispatch } from 'react';
import toast from 'react-hot-toast';

import {
  useProxiedPathContext,
  type ProxiedPath
} from '@/contexts/ProxiedPathContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { DependentViewsError } from '@/queries/proxiedPathQueries';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import {
  escapePathForUrl,
  joinPaths,
  normalizeFspRootPath,
  normalizePosixStylePath
} from '@/utils/pathHandling';
import useCopyTooltip from './useCopyTooltip';
import type { OpenWithToolUrls, PendingToolKey } from '@/hooks/useZarrMetadata';

const VALID_URL_PREFIX_RE = /^[A-Za-z0-9\-._~/!@$&'()*+,;:=%]+$/;

/**
 * The url_prefix a new Data Link gets from the user's subpath-mode preference
 * when no custom prefix is supplied. `path` is already FSP-root-normalized.
 */
export function defaultUrlPrefix(
  mode: 'name' | 'full_path' | 'custom',
  path: string,
  fspName: string,
  linuxPath: string | null | undefined
): string {
  switch (mode) {
    case 'full_path':
      return escapePathForUrl(
        normalizePosixStylePath(
          linuxPath ? joinPaths(linuxPath, path) : path || fspName
        )
      );
    case 'custom':
      return path.split('/').pop() || fspName;
    case 'name':
    default:
      // basename of "" is "" — fall back to the FSP name for FSP-root
      // links so the URL still has a meaningful trailing segment.
      return escapePathForUrl(path.split('/').pop() || fspName);
  }
}

export function validateUrlPrefix(value: string): string | null {
  if (!value || !value.trim()) {
    return 'Data link name must not be empty';
  }
  if (!VALID_URL_PREFIX_RE.test(value)) {
    const invalidChars = [
      ...new Set([...value].filter(c => !VALID_URL_PREFIX_RE.test(c)))
    ];
    return `Contains invalid URL characters: ${invalidChars.join(' ')}`;
  }
  if (value.startsWith('/') || value.endsWith('/')) {
    return 'Data link name must not start or end with /';
  }
  if (value.includes('//')) {
    return 'Data link name must not contain consecutive slashes';
  }
  // `.` and `..` get collapsed by URL normalization at the recipient,
  // which breaks key/path resolution when the link is opened.
  if (value.split('/').some(seg => seg === '.' || seg === '..')) {
    return "Data link name must not contain '.' or '..' segments";
  }
  return null;
}

// Overload for ZarrPreview usage with required parameters
export default function useDataToolLinks(
  setShowDataLinkDialog: Dispatch<SetStateAction<boolean>>,
  openWithToolUrls: OpenWithToolUrls | null,
  pendingToolKey: PendingToolKey,
  setPendingToolKey: Dispatch<SetStateAction<PendingToolKey>>
): {
  handleCreateDataLink: (pathOverride?: string) => Promise<boolean>;
  handleDeleteDataLink: (
    proxiedPath: ProxiedPath,
    confirm?: boolean
  ) => Promise<void>;
  handleToolClick: (toolKey: PendingToolKey) => Promise<void>;
  handleDialogConfirm: (urlPrefixOverride?: string) => Promise<void>;
  handleDialogCancel: () => void;
  showCopiedTooltip: boolean;
};

// Overload for linksColumns and PropertiesDrawer usage with only one param
export default function useDataToolLinks(
  setShowDataLinkDialog: Dispatch<SetStateAction<boolean>>
): {
  handleCreateDataLink: (pathOverride?: string) => Promise<boolean>;
  handleDeleteDataLink: (
    proxiedPath: ProxiedPath,
    confirm?: boolean
  ) => Promise<void>;
  handleToolClick: (toolKey: PendingToolKey) => Promise<void>;
  handleDialogConfirm: (urlPrefixOverride?: string) => Promise<void>;
  handleDialogCancel: () => void;
  showCopiedTooltip: boolean;
};

export default function useDataToolLinks(
  setShowDataLinkDialog: Dispatch<SetStateAction<boolean>>,
  openWithToolUrls?: OpenWithToolUrls | null,
  pendingToolKey?: PendingToolKey,
  setPendingToolKey?: Dispatch<SetStateAction<PendingToolKey>>
) {
  // Store current URLs in a ref to avoid stale closure issues
  const currentUrlsRef = useRef(openWithToolUrls);
  currentUrlsRef.current = openWithToolUrls;
  const creatingRef = useRef(false);

  const { fileQuery, fileBrowserState } = useFileBrowserContext();
  const {
    createProxiedPathMutation,
    deleteProxiedPathMutation,
    allProxiedPathsQuery,
    currentDirProxiedPathQuery
  } = useProxiedPathContext();

  const { areDataLinksAutomatic, dataLinkSubpathMode } =
    usePreferencesContext();
  const { externalDataUrlQuery } = useExternalBucketContext();
  const { handleCopy, showCopiedTooltip } = useCopyTooltip();

  // Sync validation half of link creation: toasts and returns null on any
  // guard failure, so callers can bail before doing anything visible.
  const prepareDataLink = (
    pathOverride?: string,
    urlPrefixOverride?: string
  ) => {
    const rawPath = pathOverride ?? fileBrowserState.dataLinkPath;
    if (!fileQuery.data?.currentFileSharePath) {
      toast.error('No file share path selected');
      return null;
    }
    if (rawPath === null || rawPath === undefined) {
      toast.error('No file or folder selected');
      return null;
    }
    // Filestore returns the FSP root as ".", but a literal "." in the share
    // URL gets collapsed by URL normalization at the recipient, producing
    // path mismatch / NoSuchBucket errors. Send "" to the backend instead.
    const path = normalizeFspRootPath(rawPath);
    const fspName = fileQuery.data.currentFileSharePath.name;
    const urlPrefix =
      urlPrefixOverride ??
      defaultUrlPrefix(
        dataLinkSubpathMode,
        path,
        fspName,
        fileQuery.data.currentFileSharePath.linux_path
      );

    const validationError = validateUrlPrefix(urlPrefix);
    if (validationError) {
      toast.error(validationError);
      return null;
    }
    return { fsp_name: fspName, path, url_prefix: urlPrefix };
  };

  const submitDataLink = async (
    request: NonNullable<ReturnType<typeof prepareDataLink>>
  ): Promise<boolean> => {
    try {
      await createProxiedPathMutation.mutateAsync(request);
      toast.success('Data link created successfully');
      await allProxiedPathsQuery.refetch();
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Error creating data link: ${errorMessage}`);
      return false;
    }
  };

  const handleCreateDataLink = async (
    pathOverride?: string,
    urlPrefixOverride?: string
  ): Promise<boolean> => {
    const request = prepareDataLink(pathOverride, urlPrefixOverride);
    return request ? submitDataLink(request) : false;
  };

  const executeToolAction = async (
    toolKey: PendingToolKey,
    urls: OpenWithToolUrls,
    tab?: Window | null
  ) => {
    if (!urls) {
      return;
    }

    try {
      if (toolKey === 'copy') {
        await handleCopy(urls.copy);
      } else if (toolKey) {
        const navigationUrl = urls[toolKey];

        if (navigationUrl && tab && !tab.closed) {
          tab.location.href = navigationUrl;
        } else if (navigationUrl) {
          // Also the fallback when the user closed the pre-opened tab:
          // setting location on a closed window is a silent no-op.
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
          tab?.close();
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
    clickedToolKey?: PendingToolKey,
    urlPrefixOverride?: string
  ) => {
    const toolKey = clickedToolKey || pendingToolKey;
    if (!toolKey) {
      return;
    }

    // A second click while the first is still creating the link would POST
    // a duplicate (409) and flash a second blank tab. Ignore it.
    if (creatingRef.current) {
      return;
    }
    // Viewer icon flow: always create data link for the current directory,
    // not the properties target (which may be a selected subdirectory row)
    const request = prepareDataLink(
      fileQuery.data?.currentFileOrFolder?.path,
      urlPrefixOverride
    );
    if (!request) {
      return;
    }

    // Open the tab now, while the click's user activation is still fresh:
    // creating the data link (worker validation, refetch) can outlast it and
    // get the popup blocked. Falls back to an anchor click if blocked anyway.
    const tab = toolKey === 'copy' ? null : window.open('', '_blank');
    if (tab) {
      tab.opener = null;
    }

    creatingRef.current = true;
    const success = await submitDataLink(request).finally(() => {
      creatingRef.current = false;
    });
    if (!success) {
      // If link creation fails, exit immediately without waiting or showing navigation error
      tab?.close();
      return;
    }

    // Wait for URLs to be updated and use ref to get current value
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds max

    while (attempts < maxAttempts) {
      const currentUrls = currentUrlsRef.current;

      if (currentUrls && currentUrls.copy && currentUrls.copy !== '') {
        await executeToolAction(toolKey, currentUrls, tab);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    if (attempts >= maxAttempts) {
      tab?.close();
      toast.error(
        `${toolKey === 'copy' ? 'Error copying data link' : `Error navigating to ${toolKey}`}`
      );
    }
  };

  const handleToolClick = async (toolKey: PendingToolKey) => {
    if (!currentDirProxiedPathQuery.data && !externalDataUrlQuery.data) {
      if (areDataLinksAutomatic && dataLinkSubpathMode !== 'custom') {
        await createLinkAndExecuteAction(toolKey);
      } else {
        setPendingToolKey?.(toolKey);
        setShowDataLinkDialog?.(true);
      }
    } else if (
      (currentDirProxiedPathQuery.data || externalDataUrlQuery.data) &&
      openWithToolUrls
    ) {
      await executeToolAction(toolKey, openWithToolUrls);
    }
  };

  // First case is for link creation through a data tool button click
  // Second case is for link creation through the PropertiesDrawer dialog
  const handleDialogConfirm = async (urlPrefixOverride?: string) => {
    if (pendingToolKey) {
      await createLinkAndExecuteAction(undefined, urlPrefixOverride);
    } else {
      await handleCreateDataLink(undefined, urlPrefixOverride);
    }
    setShowDataLinkDialog?.(false);
  };

  const handleDialogCancel = () => {
    setPendingToolKey?.(null);
    setShowDataLinkDialog(false);
  };

  const handleDeleteDataLink = async (
    proxiedPath: ProxiedPath,
    confirm = false
  ) => {
    if (!proxiedPath) {
      toast.error('Proxied path not found');
      return;
    }

    try {
      await deleteProxiedPathMutation.mutateAsync({
        sharing_key: proxiedPath.sharing_key,
        confirm
      });
      await allProxiedPathsQuery.refetch();
      toast.success('Successfully deleted data link');
    } catch (error) {
      if (error instanceof DependentViewsError) {
        throw error; // the dialog catches this to show the confirm step
      }
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
