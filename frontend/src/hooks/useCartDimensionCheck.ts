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

const NO_SOURCES: DatasetRef[] = [];

export type CartDimensionCheck = {
  mismatchedKeys: Set<string>;
  hasMismatch: boolean;
  kindByKey: Map<string, DatasetKind | 'loading'>;
};

/** A dataset already in the View, compared against the cart's datasets. */
export type DatasetRef = { fsp_name: string; path: string };

// One entry per unique dataset, preserving first-added order (order[0] is the
// reference dataset for the mismatch comparison).
function uniqueDatasets(items: DatasetRef[]) {
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

/**
 * Flags cart datasets whose dimensions differ from the reference: the first
 * of `viewSources` (the open View's datasets, in layer order) that has a
 * signature, else the first cart dataset. A View's dimensions come from its
 * first dataset at checkout.
 * ponytail: viewSources are the saved rows, so a first layer removed but not
 * yet saved still sets the reference.
 */
export function useCartDimensionCheck(
  items: CartItem[],
  viewSources: DatasetRef[] = NO_SOURCES
): CartDimensionCheck {
  const datasets = useMemo(() => uniqueDatasets(items), [items]);
  const refs = useMemo(() => uniqueDatasets(viewSources), [viewSources]);
  const probed = useMemo(() => [...datasets, ...refs], [datasets, refs]);

  const results = useQueries({
    queries: probed.map(ds => ({
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
    const signatures = probed.map((ds, i) => {
      const probe = results[i]?.data;
      if (i < datasets.length) {
        kindByKey.set(ds.key, probe?.kind ?? 'loading');
      }
      // Fail open: only OME datasets have a signature; null never warns.
      return probe?.kind === 'ome'
        ? getDimensionSignature(probe.metadata)
        : null;
    });

    const viewReference = signatures.slice(datasets.length).find(Boolean);
    const reference = viewReference ?? signatures[0];
    const mismatchedKeys = new Set<string>();
    if (reference) {
      // A View reference checks every cart dataset; otherwise the first cart
      // dataset is the reference.
      for (let i = viewReference ? 0 : 1; i < datasets.length; i++) {
        const sig = signatures[i];
        if (sig && !signaturesMatch(reference, sig)) {
          mismatchedKeys.add(datasets[i].key);
        }
      }
    }
    return { mismatchedKeys, hasMismatch: mismatchedKeys.size > 0, kindByKey };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probed, resolvedKey]);
}
