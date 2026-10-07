import { useCallback } from 'react';
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
 * view_layers. Added datasets leave the cart. Ones that won't load as a
 * layer stay, with the cart's warning.
 */
export function useAddToView(
  bridge: NeuroglancerBridge,
  onEdited: () => void
): (items: CartItem[]) => Promise<void> {
  const { resolveCartDatasets } = useCartCheckout();
  const { removeManyFromCart } = useCartContext();

  return useCallback(
    async (items: CartItem[]) => {
      const resolved = await resolveCartDatasets(items);
      const { ng_state, layers } = await buildViewState(resolved);
      const added = (ng_state.layers ?? []) as NgLayer[];
      if (added.length === 0) {
        throw new Error('None of these datasets load as Neuroglancer layers');
      }
      const unsupportedKeys = new Set(
        layers.filter(isUnsupportedLayer).map(l => l.sharing_key)
      );
      const unsupported = new Set(
        resolved
          .filter(ds => unsupportedKeys.has(ds.sharing_key))
          .map(ds => datasetKey(ds.fsp_name, ds.path))
      );

      // Read the state after the slow probing, so camera moves made while
      // waiting are kept. Throws if Neuroglancer is mid-reload.
      bridge.setState(appendLayers(bridge.getState(), added));
      onEdited();

      // Match the raw cart items, not `resolved`: checkout drops a base
      // entry shadowed by channel entries, and it must leave the cart too.
      const done = items.filter(
        i => !unsupported.has(datasetKey(i.fsp_name, i.path))
      );
      try {
        await removeManyFromCart(
          done.map(i => ({ path: i.path, channel: i.channel }))
        );
      } catch {
        toast.error('Layers added, but the cart could not be updated');
      }
      const skipped = unsupported.size
        ? ` ${unsupported.size} dataset${unsupported.size === 1 ? '' : 's'} can't load as a layer and stayed in the cart.`
        : '';
      toast.success(
        `Added ${added.length} layer${added.length === 1 ? '' : 's'}. Save to keep ${added.length === 1 ? 'it' : 'them'}.${skipped}`
      );
    },
    [resolveCartDatasets, removeManyFromCart, bridge, onEdited]
  );
}
