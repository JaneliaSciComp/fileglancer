import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

import { useCartContext } from '@/contexts/CartContext';
import { useCartCheckout } from '@/hooks/useCartCheckout';
import { isRelinkableLayer } from '@/queries/viewQueries';
import {
  appendLayers,
  buildViewState,
  dataLinkSegment,
  isUnsupportedLayer,
  rewriteDataLinkSegment
} from '@/utils/viewCheckout';
import { datasetKey } from '@/utils/pathHandling';
import type { CartItem } from '@/contexts/CartContext';
import type { NeuroglancerBridge } from '@/hooks/useNeuroglancerViewer';
import type { ViewLayer } from '@/queries/viewQueries';
import type { NgLayer } from '@/utils/viewCheckout';

/**
 * Adds cart datasets as layers to the View open in the embedded viewer. The
 * change stays local until the owner Saves; the server then records the new
 * view_layers. Datasets that won't load as a layer go to `onAddSources`, so
 * Save records them as unsupported sources. Every added dataset leaves the
 * cart.
 */
export function useAddToView(
  bridge: NeuroglancerBridge,
  {
    viewLayers,
    onEdited,
    onAddSources
  }: {
    /** The View's saved layer rows, to find its broken sources. */
    readonly viewLayers: ViewLayer[];
    readonly onEdited: () => void;
    readonly onAddSources: (sharingKeys: string[]) => void;
  }
): (items: CartItem[]) => Promise<void> {
  const { resolveCartDatasets } = useCartCheckout();
  const { removeManyFromCart } = useCartContext();
  // The sidebar unmounts when NG reloads (the bridge leaves `ready`). An add
  // still in flight then holds the dead viewer, so it must stop.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return useCallback(
    async (items: CartItem[]) => {
      // Snapshot before resolving: creating a Data Link relinks this View's
      // broken layers on that dataset server-side and refetches the rows.
      const broken = viewLayers.filter(isRelinkableLayer);
      const resolved = await resolveCartDatasets(items);
      const { ng_state, layers } = await buildViewState(resolved);
      const added = (ng_state.layers ?? []) as NgLayer[];
      const unsupportedKeys = [
        ...new Set(
          layers
            .filter(isUnsupportedLayer)
            .map(l => l.sharing_key)
            .filter((k): k is string => !!k)
        )
      ];

      if (!mounted.current) {
        throw new Error(
          'The viewer closed or reloaded while adding. Nothing was added.'
        );
      }
      // Read the state after the slow probing, so camera moves made while
      // waiting are kept.
      let current = bridge.getState();
      // Save sends this local state, so it must carry the server's relink:
      // point the View's broken layers on an added dataset at its live
      // Data Link, or the Save re-breaks them.
      let relinked = false;
      for (const row of broken) {
        const ds = resolved.find(
          d =>
            row.fsp_name !== null &&
            row.path !== null &&
            datasetKey(d.fsp_name, d.path) ===
              datasetKey(row.fsp_name, row.path)
        );
        if (ds && ds.sharing_key !== row.sharing_key) {
          current = rewriteDataLinkSegment(
            current,
            dataLinkSegment(row.sharing_key, row.url_prefix),
            dataLinkSegment(ds.sharing_key, ds.url_prefix)
          );
          relinked = true;
        }
      }
      if (added.length > 0 || relinked) {
        bridge.setState(appendLayers(current, added));
        onEdited();
      }
      if (unsupportedKeys.length > 0) {
        onAddSources(unsupportedKeys);
      }

      // Remove the raw cart items, not `resolved`: checkout drops a base
      // entry shadowed by channel entries, and it must leave the cart too.
      try {
        await removeManyFromCart(
          items.map(i => ({ path: i.path, channel: i.channel }))
        );
      } catch {
        toast.error('Added to the View, but the cart could not be updated');
      }
      const count = new Set(
        resolved.map(ds => datasetKey(ds.fsp_name, ds.path))
      ).size;
      const skipped = unsupportedKeys.length
        ? ` ${unsupportedKeys.length} can't display in Neuroglancer and will be listed as ${unsupportedKeys.length === 1 ? 'a source' : 'sources'} only.`
        : '';
      toast.success(
        `Added ${count} dataset${count === 1 ? '' : 's'}. Save to keep ${count === 1 ? 'it' : 'them'}.${skipped}`
      );
    },
    [
      resolveCartDatasets,
      removeManyFromCart,
      bridge,
      viewLayers,
      onEdited,
      onAddSources
    ]
  );
}
