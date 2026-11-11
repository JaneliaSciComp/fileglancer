import { useMemo } from 'react';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import type { ViewerUrlSource } from '@/contexts/PreferencesContext';
import { useViewersContext } from '@/contexts/ViewersContext';
import { resolveViewerTemplate } from '@/utils/viewerUrl';

// Used only when no Neuroglancer viewer is configured and no custom URL is set.
export const DEFAULT_NEUROGLANCER_BASE_URL =
  'https://neuroglancer-demo.appspot.com/';

/**
 * The Neuroglancer base URL (the part before the '#!' state fragment) for the
 * given URL preference, honoring the deployment's configured URL.
 */
function useNeuroglancerBaseUrl(source: ViewerUrlSource | undefined): string {
  const { validViewers } = useViewersContext();

  return useMemo(() => {
    const neuroglancer = validViewers.find(v => v.key === 'neuroglancer');
    if (neuroglancer) {
      const template = resolveViewerTemplate(neuroglancer, source);
      // Strip the '#!' state fragment to get the bare base URL.
      return template.split('#!')[0] || DEFAULT_NEUROGLANCER_BASE_URL;
    }
    // No Neuroglancer viewer is configured, so 'configured'/'manifest' have no
    // template to resolve. A user-supplied custom URL is the only preference
    // value that carries a URL on its own; otherwise fall back to the external
    // default.
    if (typeof source === 'object' && source.custom) {
      return source.custom.split('#!')[0] || DEFAULT_NEUROGLANCER_BASE_URL;
    }
    return DEFAULT_NEUROGLANCER_BASE_URL;
  }, [validViewers, source]);
}

/**
 * The base URL for standalone Neuroglancer: the metadata panel's button and
 * new short links. Follows the user's standalone Neuroglancer URL preference.
 */
export function useDefaultNeuroglancerBaseUrl(): string {
  const { viewerUrlSources } = usePreferencesContext();
  return useNeuroglancerBaseUrl(viewerUrlSources['neuroglancer']);
}

/**
 * The base URL for a View's "Open in Neuroglancer" link-out. Follows its own
 * preference, separate from standalone Neuroglancer.
 */
export function useViewsNeuroglancerBaseUrl(): string {
  const { viewsNeuroglancerUrlSource } = usePreferencesContext();
  return useNeuroglancerBaseUrl(viewsNeuroglancerUrlSource);
}

/**
 * The Internal (deployment-configured) Neuroglancer base URL, ignoring the
 * user's Internal/External viewer-URL preference. The embedded viewer uses
 * this because the "External" preference (e.g. neuroglancer-demo.appspot.com)
 * sends X-Frame-Options and won't render in an iframe; the configured/internal
 * deployment is same-origin/frameable. Portable: no hardcoded URL — falls back
 * to DEFAULT_NEUROGLANCER_BASE_URL only where no internal NG is configured.
 * Null until the viewers config has loaded, so callers don't settle on the
 * fallback while the configured URL is still on its way.
 */
export function useInternalNeuroglancerBaseUrl(): string | null {
  const { validViewers, isInitialized } = useViewersContext();
  return useMemo(() => {
    if (!isInitialized) {
      return null;
    }
    const neuroglancer = validViewers.find(v => v.key === 'neuroglancer');
    if (neuroglancer) {
      return (
        resolveViewerTemplate(neuroglancer, 'configured').split('#!')[0] ||
        DEFAULT_NEUROGLANCER_BASE_URL
      );
    }
    return DEFAULT_NEUROGLANCER_BASE_URL;
  }, [validViewers, isInitialized]);
}
