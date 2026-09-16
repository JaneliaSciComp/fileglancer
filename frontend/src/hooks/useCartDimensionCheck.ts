import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { datasetKey, getFileURL } from '@/utils/pathHandling';
import { probeDataset } from '@/utils/viewCheckout';
import type { DatasetKind, DatasetProbe } from '@/utils/viewCheckout';
import {
  getDimensionSignature,
  signaturesMatch
} from '@/utils/dimensionSignature';
import type { CartItem } from '@/contexts/CartContext';

export type CartDimensionCheck = {
  mismatchedKeys: Set<string>;
  hasMismatch: boolean;
  kindByKey: Map<string, DatasetKind | 'loading'>;
};

// One entry per unique dataset, preserving first-added order (order[0] is the
// reference dataset for the mismatch comparison).
function uniqueDatasets(items: CartItem[]) {
  const seen = new Set<string>();
  const out: { key: string; fsp_name: string; path: string }[] = [];
  for (const item of items) {
    const key = datasetKey(item.fsp_name, item.path);
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ key, fsp_name: item.fsp_name, path: item.path });
    }
  }
  return out;
}

export function useCartDimensionCheck(items: CartItem[]): CartDimensionCheck {
  const datasets = useMemo(() => uniqueDatasets(items), [items]);

  const results = useQueries({
    queries: datasets.map(ds => ({
      queryKey: ['zarr', 'probe', ds.fsp_name, ds.path],
      queryFn: (): Promise<DatasetProbe> =>
        probeDataset(getFileURL(ds.fsp_name, ds.path)),
      staleTime: 5 * 60 * 1000,
      retry: false
    }))
  });

  // useQueries returns fresh array refs each render; key the memo on which
  // datasets have resolved so it recomputes as probes land.
  const resolvedKey = results.map(r => r.data?.kind ?? '-').join(',');

  return useMemo(() => {
    const kindByKey = new Map<string, DatasetKind | 'loading'>();
    const signatures = datasets.map((ds, i) => {
      const probe = results[i]?.data;
      kindByKey.set(ds.key, probe?.kind ?? 'loading');
      // Fail open: only OME datasets have a signature; null never warns.
      return probe?.kind === 'ome'
        ? getDimensionSignature(probe.metadata)
        : null;
    });

    const reference = signatures[0];
    const mismatchedKeys = new Set<string>();
    if (reference) {
      for (let i = 1; i < datasets.length; i++) {
        const sig = signatures[i];
        if (sig && !signaturesMatch(reference, sig)) {
          mismatchedKeys.add(datasets[i].key);
        }
      }
    }
    return { mismatchedKeys, hasMismatch: mismatchedKeys.size > 0, kindByKey };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets, resolvedKey]);
}
