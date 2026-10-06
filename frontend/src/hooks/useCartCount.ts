import { usePreferencesContext } from '@/contexts/PreferencesContext';

// ponytail: nav badge reads the preference directly, not CartContext — avoids
// wrapping the whole app in CartProvider just for a count.
export function useCartCount(): number {
  const { preferenceQuery } = usePreferencesContext();
  return preferenceQuery.data?.neuroglancerCart?.length ?? 0;
}
