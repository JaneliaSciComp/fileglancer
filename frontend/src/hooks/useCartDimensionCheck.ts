import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { getOmeZarrMetadata } from '@/omezarr-helper';
import type { Metadata } from '@/omezarr-helper';
import { datasetKey, getFileURL } from '@/utils/pathHandling';
import {
  getDimensionSignature,
  signaturesMatch
} from '@/utils/dimensionSignature';
import type { CartItem } from '@/contexts/CartContext';

export type CartDimensionCheck = {
  mismatchedKeys: Set<string>;
  hasMismatch: boolean;
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
      queryKey: ['zarr', 'dims', ds.fsp_name, ds.path],
      queryFn: async (): Promise<Metadata> =>
        getOmeZarrMetadata(getFileURL(ds.fsp_name, ds.path)),
      staleTime: 5 * 60 * 1000,
      retry: false
    }))
  });

  // useQueries returns fresh array refs each render; key the memo on which
  // datasets have resolved data so it recomputes as metadata lands.
  const resolvedKey = results.map(r => (r.data ? 1 : 0)).join(',');

  return useMemo(() => {
    // Signature per dataset, or null when loading/errored/no-multiscale.
    // Fail open: a null signature never produces a warning.
    const signatures = datasets.map((_, i) => {
      const data = results[i]?.data;
      return data ? getDimensionSignature(data) : null;
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
    return { mismatchedKeys, hasMismatch: mismatchedKeys.size > 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets, resolvedKey]);
}
