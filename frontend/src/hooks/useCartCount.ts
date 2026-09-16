import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { datasetKey } from '@/utils/pathHandling';

// ponytail: nav badge reads the preference directly, not CartContext — avoids
// wrapping the whole app in CartProvider just for a count.
// Counts datasets (cart rows), not per-channel entries.
export function useCartCount(): number {
  const { preferenceQuery } = usePreferencesContext();
  const items = preferenceQuery.data?.neuroglancerCart ?? [];
  return new Set(items.map(i => datasetKey(i.fsp_name, i.path))).size;
}
