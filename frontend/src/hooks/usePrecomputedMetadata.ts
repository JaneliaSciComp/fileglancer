import { useMemo } from 'react';

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useViewersContext } from '@/contexts/ViewersContext';
import { usePrecomputedInfoQuery } from '@/queries/precomputedQueries';
import { precomputedState } from '@/utils/precomputed';
import { resolveViewerTemplate } from '@/utils/viewerUrl';
import type { OpenWithToolUrls } from '@/queries/zarrQueries';

// Fallback used only when no Neuroglancer viewer is configured.
const FALLBACK_NEUROGLANCER_BASE_URL =
  'https://neuroglancer-demo.appspot.com/#!';

/**
 * Precomputed metadata for the directory being browsed, and its "open with"
 * URLs. Only Neuroglancer reads the format.
 */
export default function usePrecomputedMetadata() {
  const { fileQuery } = useFileBrowserContext();
  const { currentDirProxiedPathQuery } = useProxiedPathContext();
  const { externalDataUrlQuery } = useExternalBucketContext();
  const { viewerUrlSources, disableNeuroglancerStateGeneration } =
    usePreferencesContext();
  const { validViewers } = useViewersContext();

  const precomputedQuery = usePrecomputedInfoQuery(
    fileQuery.data?.currentFileSharePath?.name,
    fileQuery.data?.currentFileOrFolder,
    fileQuery.data?.files
  );
  const precomputed = precomputedQuery.data ?? null;

  const openWithToolUrls = useMemo((): OpenWithToolUrls | null => {
    if (!precomputed) {
      return null;
    }
    const url =
      externalDataUrlQuery.data || currentDirProxiedPathQuery.data?.url;
    if (!url) {
      // No Data Link yet: clicking a tool offers to create one.
      return { copy: '', neuroglancer: '' };
    }
    const neuroglancer = validViewers.find(v => v.key === 'neuroglancer');
    const baseUrl = neuroglancer
      ? resolveViewerTemplate(
          neuroglancer,
          viewerUrlSources['neuroglancer']
        ).split('#!')[0] + '#!'
      : FALLBACK_NEUROGLANCER_BASE_URL;
    const state = precomputedState(
      url,
      precomputed,
      disableNeuroglancerStateGeneration
    );
    return {
      copy: url,
      neuroglancer: baseUrl + encodeURIComponent(JSON.stringify(state))
    };
  }, [
    precomputed,
    currentDirProxiedPathQuery.data?.url,
    externalDataUrlQuery.data,
    validViewers,
    viewerUrlSources,
    disableNeuroglancerStateGeneration
  ]);

  return { precomputedQuery, openWithToolUrls };
}
