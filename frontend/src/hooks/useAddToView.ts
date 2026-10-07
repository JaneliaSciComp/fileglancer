import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

import { useCartContext } from '@/contexts/CartContext';
import { useCartCheckout } from '@/hooks/useCartCheckout';
import {
  appendLayers,
  buildViewState,
  isUnsupportedLayer
} from '@/utils/viewCheckout';
import { datasetKey } from '@/utils/pathHandling';
import type { CartItem } from '@/contexts/CartContext';
import type { NeuroglancerBridge } from '@/hooks/useNeuroglancerViewer';
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
  onEdited: () => void,
  onAddSources: (sharingKeys: string[]) => void
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
      if (added.length > 0) {
        // Read the state after the slow probing, so camera moves made while
        // waiting are kept.
        bridge.setState(appendLayers(bridge.getState(), added));
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
    [resolveCartDatasets, removeManyFromCart, bridge, onEdited, onAddSources]
  );
}
