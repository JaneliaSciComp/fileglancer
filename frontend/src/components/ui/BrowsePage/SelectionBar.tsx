import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useCartContext } from '@/contexts/CartContext';
import CreateViewButton from '@/components/ui/Views/CreateViewButton';
import FgButton from '@/components/designSystem/atoms/FgButton';
import type { CartItem } from '@/contexts/CartContext';

// ponytail: bar carries the two net-new cart actions + clear. Multi-select
// Share/Download/"More" (design §6) generalize existing single-file actions
// — deferred; add when a concrete need lands.
export default function SelectionBar() {
  const { fileBrowserState, clearChecked, fileQuery } = useFileBrowserContext();
  const { addToCart } = useCartContext();
  const navigate = useNavigate();

  const { checkedFiles } = fileBrowserState;

  if (checkedFiles.length === 0) {
    return null;
  }

  const fspName = fileQuery.data?.currentFileSharePath?.name ?? '';
  const selectionDatasets: CartItem[] = checkedFiles.map(file => ({
    fsp_name: fspName,
    path: file.path,
    label: file.name
  }));

  const handleAddToCart = async () => {
    try {
      await addToCart(selectionDatasets);
      toast.success(
        `Added ${checkedFiles.length} items to the Neuroglancer cart`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(
        `Error adding items to the Neuroglancer cart: ${errorMessage}`
      );
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full bg-surface shadow-lg px-4 py-2">
      <span className="text-foreground font-medium">
        {checkedFiles.length} selected
      </span>
      <FgButton onClick={() => void handleAddToCart()}>
        Add {checkedFiles.length} to cart
      </FgButton>
      <CreateViewButton
        datasets={selectionDatasets}
        defaultName="New View"
        label="New View from selection"
        onCreated={view => navigate(`/view/${view.read_key}`)}
      />
      <FgButton onClick={clearChecked} variant="ghost">
        Clear
      </FgButton>
    </div>
  );
}
