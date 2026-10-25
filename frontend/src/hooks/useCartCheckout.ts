import { useCallback } from 'react';

import {
  useAllProxiedPathsQuery,
  useCreateProxiedPathMutation
} from '@/queries/proxiedPathQueries';
import { useViewsContext } from '@/contexts/ViewsContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { buildViewState } from '@/utils/viewCheckout';
import type { ResolvedCheckoutDataset } from '@/utils/viewCheckout';
import { datasetKey, normalizeFspRootPath } from '@/utils/pathHandling';
import { isReadOnlyFsp } from '@/utils/cloudStorage';
import { buildUrl, makeMapKey } from '@/utils';
import type { CartItem } from '@/queries/preferencesQueries';
import type { View } from '@/queries/viewQueries';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import type { FileSharePath } from '@/shared.types';

/** What a dataset's layers are built from: a Data Link, or a bucket's own URL. */
type ResolvedLink = Pick<ProxiedPath, 'url' | 'url_prefix'> & {
  sharing_key: string | null;
};

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
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  const bucketFor = useCallback(
    (ds: Pick<CartItem, 'fsp_name'>): FileSharePath | null => {
      const fsp = zonesAndFspQuery.data?.[makeMapKey('fsp', ds.fsp_name)] as
        | FileSharePath
        | undefined;
      return isReadOnlyFsp(fsp) ? fsp! : null;
    },
    [zonesAndFspQuery.data]
  );

  /** A public bucket's data needs no Data Link; it is served at its own URL. */
  const isBucketDataset = useCallback(
    (ds: Pick<CartItem, 'fsp_name'>): boolean => bucketFor(ds) !== null,
    [bucketFor]
  );

  // Finds or creates one Data Link per dataset. Shared by checkout and
  // "Add to this View".
  const resolveCartDatasets = useCallback(
    async (rawDatasets: CartItem[]): Promise<ResolvedCheckoutDataset[]> => {
      const datasets = dropShadowedBaseEntries(rawDatasets);
      const existing = new Map<string, ProxiedPath>(
        (allProxiedPathsQuery.data ?? []).map(p => [
          datasetKey(p.fsp_name, p.path),
          p
        ])
      );

      // Resolve one Data Link per unique (fsp_name, path); create if missing.
      const linkByKey = new Map<string, ResolvedLink>();
      for (const ds of datasets) {
        const key = datasetKey(ds.fsp_name, ds.path);
        if (linkByKey.has(key)) {
          continue;
        }
        const bucket = bucketFor(ds);
        const link: ResolvedLink = bucket
          ? {
              url: buildUrl(bucket.mount_path, normalizeFspRootPath(ds.path)),
              sharing_key: null,
              url_prefix: ''
            }
          : (existing.get(key) ??
            (await createProxiedPath.mutateAsync({
              fsp_name: ds.fsp_name,
              path: normalizeFspRootPath(ds.path)
            })));
        linkByKey.set(key, link);
      }

      return datasets.map(ds => {
        const link = linkByKey.get(datasetKey(ds.fsp_name, ds.path));
        if (!link) {
          throw new Error(
            `No resolved Data Link for ${ds.fsp_name}:${ds.path}`
          );
        }
        return {
          url: link.url,
          sharing_key: link.sharing_key,
          url_prefix: link.url_prefix,
          fsp_name: ds.fsp_name,
          path: ds.path,
          channel: ds.channel,
          channelIndex: ds.channelIndex,
          label: ds.label
        };
      });
    },
    [allProxiedPathsQuery.data, createProxiedPath, bucketFor]
  );

  const checkout = useCallback(
    async (rawDatasets: CartItem[], name: string): Promise<View> => {
      const resolved = await resolveCartDatasets(rawDatasets);
      const { ng_state, layers } = await buildViewState(resolved);
      return createViewMutation.mutateAsync({ name, ng_state, layers });
    },
    [resolveCartDatasets, createViewMutation]
  );

  return { checkout, resolveCartDatasets, isBucketDataset };
}
