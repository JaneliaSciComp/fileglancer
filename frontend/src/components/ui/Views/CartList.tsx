import { useMemo } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';

import CartDatasetRow from '@/components/ui/Views/CartDatasetRow';
import CreateViewButton from '@/components/ui/Views/CreateViewButton';
import FgButton from '@/components/designSystem/atoms/FgButton';
import { useCartContext } from '@/contexts/CartContext';
import { useCartDimensionCheck } from '@/hooks/useCartDimensionCheck';
import { datasetKey } from '@/utils/pathHandling';
import type { CartItem } from '@/contexts/CartContext';

type CartGroup = {
  fsp_name: string;
  path: string;
  label: string;
  items: CartItem[];
};

function groupCartByDataset(cart: CartItem[]): CartGroup[] {
  const groups = new Map<string, CartGroup>();
  for (const item of cart) {
    const key = datasetKey(item.fsp_name, item.path);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      // Prefer the base (no-channel) entry's label for the dataset row.
      if (!item.channel) {
        existing.label = item.label;
      }
    } else {
      // A channel-only entry's label is the channel name (e.g. "DAPI"), not
      // the dataset name - fall back to the path until/unless a base entry
      // shows up, rather than letting a channel string become the header.
      groups.set(key, {
        fsp_name: item.fsp_name,
        path: item.path,
        label: item.channel ? item.path : item.label,
        items: [item]
      });
    }
  }
  return Array.from(groups.values());
}

export default function CartList() {
  const { cart, clearCart } = useCartContext();
  const navigate = useNavigate();

  const cartGroups = useMemo(() => groupCartByDataset(cart), [cart]);
  const { mismatchedKeys } = useCartDimensionCheck(cart);

  const handleClearCart = async () => {
    try {
      await clearCart();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Clear failed');
    }
  };

  if (cart.length === 0) {
    return (
      <Typography className="text-foreground/70">
        Your Layer Cart is empty. Add datasets from the file browser.
      </Typography>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {cartGroups.map(group => (
        <CartDatasetRow
          fsp_name={group.fsp_name}
          items={group.items}
          key={datasetKey(group.fsp_name, group.path)}
          label={group.label}
          mismatch={mismatchedKeys.has(datasetKey(group.fsp_name, group.path))}
          path={group.path}
        />
      ))}
      <div className="flex gap-3">
        <CreateViewButton
          datasets={cart}
          defaultName="New View"
          label="Create View"
          onCreated={view => {
            // Fire-and-forget: the View already exists, so a cart-clear
            // failure (a separate network mutation) must not block
            // navigation. Worst case is a stale cart item, which is
            // low-stakes and independently retryable via "Clear cart".
            clearCart().catch(() => {
              toast.error('View created, but the cart could not be cleared');
            });
            navigate(`/view/${view.read_key}`);
          }}
        />
        <FgButton
          color="error"
          onClick={() => void handleClearCart()}
          variant="ghost"
        >
          Clear cart
        </FgButton>
      </div>
    </div>
  );
}
