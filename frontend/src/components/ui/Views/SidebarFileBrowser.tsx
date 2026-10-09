import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import FgButton from '@/components/designSystem/atoms/FgButton';
import FileSelectorBrowser from '@/components/ui/FileSelector/FileSelectorBrowser';
import { useCartContext } from '@/contexts/CartContext';
import useFileSelector from '@/hooks/useFileSelector';
import type { FileOrFolder } from '@/shared.types';

/**
 * The file selector dialog's browser in the viewer's "Add data" sidebar:
 * navigate, check datasets, add them to the Layer Cart. Nothing is probed
 * here; the Layer Cart tab shows each dataset's warnings once it's added.
 */
export default function SidebarFileBrowser() {
  const selector = useFileSelector({ defaultToHome: true });
  const { state, displayItems, navigateToLocation, handleItemDoubleClick } =
    selector;
  const { addToCart } = useCartContext();
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const location = state.currentLocation;
  const checkedFiles = displayItems.filter(f => checked.has(f.path));

  // Checks belong to the folder on screen, as on the Browse page, so a
  // cart add never mixes folders or file shares.
  useEffect(() => {
    setChecked(new Set());
  }, [location]);

  // Follow a symlink into its target share, as the Browse page does; one
  // with no target share is broken or points outside every share.
  const open = (item: FileOrFolder) => {
    if (!item.is_dir) {
      return;
    }
    if (item.symlink_target_fsp) {
      navigateToLocation({
        type: 'filesystem',
        fspName: item.symlink_target_fsp.fsp_name,
        path: item.symlink_target_fsp.subpath || '.'
      });
    } else if (!item.is_symlink) {
      handleItemDoubleClick(item);
    }
  };

  const toggle = (item: FileOrFolder) =>
    setChecked(prev => {
      const next = new Set(prev);
      if (!next.delete(item.path)) {
        next.add(item.path);
      }
      return next;
    });

  const add = async () => {
    if (location.type !== 'filesystem') {
      return;
    }
    setAdding(true);
    try {
      await addToCart(
        checkedFiles.map(f => ({
          fsp_name: location.fspName,
          path: f.path,
          label: f.name
        }))
      );
      const count = checkedFiles.length;
      toast.success(`Added ${count} item${count === 1 ? '' : 's'} to the cart`);
      setChecked(new Set());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Error adding items to the cart: ${message}`);
    } finally {
      setAdding(false);
    }
  };

  return (
    // The shared browser is sized for the dialog; shrink all of its text
    // (MT's Typography sets its own size, so inheriting text-sm won't do).
    <section
      aria-label="Browse files"
      className="flex min-h-0 flex-1 flex-col [&_*]:!text-sm"
    >
      <FileSelectorBrowser
        checkedPaths={checked}
        onItemClick={item => {
          if (location.type === 'filesystem') {
            toggle(item);
          }
        }}
        onItemDoubleClick={open}
        onToggleChecked={toggle}
        selector={selector}
        showPathInput={false}
        tableClassName="my-2 min-h-[10rem] flex-1"
      />
      <FgButton
        disabled={adding || checkedFiles.length === 0}
        loading={adding}
        loadingText="Adding..."
        onClick={() => void add()}
      >
        {checkedFiles.length > 0
          ? `Add ${checkedFiles.length} to cart`
          : 'Add to cart'}
      </FgButton>
    </section>
  );
}
