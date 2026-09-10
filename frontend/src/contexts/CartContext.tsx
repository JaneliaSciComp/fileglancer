import { createContext, useCallback, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useUpdatePreferenceMutation } from '@/queries/preferencesQueries';
import type { CartItem } from '@/queries/preferencesQueries';

export type { CartItem };

type CartContextType = {
  cart: CartItem[];
  cartCount: number;
  addToCart: (items: CartItem[]) => Promise<void>;
  removeFromCart: (path: string, channel?: string) => Promise<void>;
  clearCart: () => Promise<void>;
};

const CartContext = createContext<CartContextType | null>(null);

export const useCartContext = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCartContext must be used within a CartProvider');
  }
  return context;
};

// Identity of a cart entry: fsp + path + channel (channel-per-layer).
const itemKey = (i: CartItem) => `${i.fsp_name}::${i.path}::${i.channel ?? ''}`;

export const CartProvider = ({
  children
}: {
  readonly children: ReactNode;
}) => {
  const { preferenceQuery } = usePreferencesContext();
  const updatePreference = useUpdatePreferenceMutation();

  const cart = useMemo(
    () => preferenceQuery.data?.neuroglancerCart ?? [],
    [preferenceQuery.data?.neuroglancerCart]
  );

  const persist = useCallback(
    async (next: CartItem[]) => {
      await updatePreference.mutateAsync({
        key: 'neuroglancerCart',
        value: next
      });
    },
    [updatePreference]
  );

  const addToCart = useCallback(
    async (items: CartItem[]) => {
      const seen = new Set(cart.map(itemKey));
      const additions: CartItem[] = [];
      for (const item of items) {
        const key = itemKey(item);
        if (!seen.has(key)) {
          seen.add(key);
          additions.push(item);
        }
      }
      if (additions.length === 0) {
        return;
      }
      await persist([...cart, ...additions]);
    },
    [cart, persist]
  );

  const removeFromCart = useCallback(
    async (path: string, channel?: string) => {
      await persist(
        cart.filter(i => !(i.path === path && i.channel === channel))
      );
    },
    [cart, persist]
  );

  const clearCart = useCallback(() => persist([]), [persist]);

  const value: CartContextType = {
    cart,
    cartCount: cart.length,
    addToCart,
    removeFromCart,
    clearCart
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export default CartContext;
