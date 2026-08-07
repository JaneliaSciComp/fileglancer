import { useCallback } from 'react';

import {
  useAllProxiedPathsQuery,
  useCreateProxiedPathMutation
} from '@/queries/proxiedPathQueries';
import { useViewsContext } from '@/contexts/ViewsContext';
import { buildViewState } from '@/utils/viewCheckout';
import type { ResolvedCheckoutDataset } from '@/utils/viewCheckout';
import { datasetKey, normalizeFspRootPath } from '@/utils/pathHandling';
import type { CartItem } from '@/queries/preferencesQueries';
import type { View } from '@/queries/viewQueries';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';

// A dataset can hold both a base (channel-less) CartItem and channel-specific
// CartItems at once. Drop the base entry when channel entries exist for the
// same dataset, so buildViewState doesn't run the dataset twice (once for
// the base entry's full layer set, once more for the duplicate channel).
function dropShadowedBaseEntries(datasets: CartItem[]): CartItem[] {
  const hasChannelByKey = new Map<string, boolean>();
  for (const ds of datasets) {
    const key = datasetKey(ds.fsp_name, ds.path);
    if (ds.channel) {
      hasChannelByKey.set(key, true);
    } else if (!hasChannelByKey.has(key)) {
      hasChannelByKey.set(key, false);
    }
  }
  return datasets.filter(ds => {
    if (ds.channel) {
      return true;
    }
    return !hasChannelByKey.get(datasetKey(ds.fsp_name, ds.path));
  });
}

export function useCartCheckout() {
  const allProxiedPathsQuery = useAllProxiedPathsQuery();
  const createProxiedPath = useCreateProxiedPathMutation();
  const { createViewMutation } = useViewsContext();

  const checkout = useCallback(
    async (rawDatasets: CartItem[], name: string): Promise<View> => {
      const datasets = dropShadowedBaseEntries(rawDatasets);
      const existing = new Map<string, ProxiedPath>(
        (allProxiedPathsQuery.data ?? []).map(p => [
          datasetKey(p.fsp_name, p.path),
          p
        ])
      );

      // Resolve one Data Link per unique (fsp_name, path); create if missing.
      const linkByKey = new Map<string, ProxiedPath>();
      for (const ds of datasets) {
        const key = datasetKey(ds.fsp_name, ds.path);
        if (linkByKey.has(key)) {
          continue;
        }
        const link =
          existing.get(key) ??
          (await createProxiedPath.mutateAsync({
            fsp_name: ds.fsp_name,
            path: normalizeFspRootPath(ds.path)
          }));
        linkByKey.set(key, link);
      }

      const resolved: ResolvedCheckoutDataset[] = datasets.map(ds => {
        const link = linkByKey.get(datasetKey(ds.fsp_name, ds.path));
        if (!link) {
          throw new Error(
            `No resolved Data Link for ${ds.fsp_name}:${ds.path}`
          );
        }
        return {
          url: link.url,
          sharing_key: link.sharing_key,
          fsp_name: ds.fsp_name,
          path: ds.path,
          channel: ds.channel,
          label: ds.label
        };
      });

      const { ng_state, layers } = await buildViewState(resolved);
      return createViewMutation.mutateAsync({ name, ng_state, layers });
    },
    [allProxiedPathsQuery.data, createProxiedPath, createViewMutation]
  );

  return { checkout };
}
