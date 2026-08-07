import { useCallback } from 'react';

import {
  useAllProxiedPathsQuery,
  useCreateProxiedPathMutation
} from '@/queries/proxiedPathQueries';
import { useViewsContext } from '@/contexts/ViewsContext';
import { buildViewState } from '@/utils/viewCheckout';
import type { ResolvedCheckoutDataset } from '@/utils/viewCheckout';
import { normalizeFspRootPath } from '@/utils/pathHandling';
import type { CartItem } from '@/queries/preferencesQueries';
import type { View } from '@/queries/viewQueries';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';

// Same normalization handleCreateDataLink applies before creating a Data
// Link (FSP root "." -> ""), so lookups against the list match what was
// actually created/stored instead of missing and creating duplicates.
const datasetKey = (fsp_name: string, path: string) =>
  `${fsp_name}::${normalizeFspRootPath(path)}`;

export function useCartCheckout() {
  const allProxiedPathsQuery = useAllProxiedPathsQuery();
  const createProxiedPath = useCreateProxiedPathMutation();
  const { createViewMutation } = useViewsContext();

  const checkout = useCallback(
    async (datasets: CartItem[], name: string): Promise<View> => {
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
