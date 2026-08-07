import { useMemo, useState } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import { TableCard } from '@/components/ui/Table/TableCard';
import { useNGViewsColumns } from '@/components/ui/Table/ngViewsColumns';
import FgDialog from '@/components/ui/Dialogs/FgDialog';
import CartDatasetRow from '@/components/ui/Views/CartDatasetRow';
import CreateViewButton from '@/components/ui/Views/CreateViewButton';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgBadge from '@/components/designSystem/atoms/FgBadge';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import { useViewsContext } from '@/contexts/ViewsContext';
import { useCartContext } from '@/contexts/CartContext';
import { useDefaultNeuroglancerBaseUrl } from '@/hooks/useDefaultNeuroglancerBaseUrl';
import { useAllProxiedPathsQuery } from '@/queries/proxiedPathQueries';
import { normalizeFspRootPath } from '@/utils/pathHandling';
import type { View } from '@/queries/viewQueries';
import type { CartItem } from '@/contexts/CartContext';

type ViewsTab = 'views' | 'cart';

// Same normalization useCartCheckout/CreateViewButton apply before
// comparing against the proxied-path list, so this lookup matches what
// checkout will actually resolve/create for the same dataset.
const datasetKey = (fsp_name: string, path: string) =>
  `${fsp_name}::${normalizeFspRootPath(path)}`;

type CartGroup = {
  fsp_name: string;
  path: string;
  label: string;
  items: CartItem[];
};

type CartGroupBuilder = CartGroup & { hasBaseLabel: boolean };

function groupCartByDataset(cart: CartItem[]): CartGroup[] {
  const groups = new Map<string, CartGroupBuilder>();
  for (const item of cart) {
    const key = datasetKey(item.fsp_name, item.path);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      // Prefer the base (no-channel) entry's label for the dataset row.
      if (!item.channel) {
        existing.label = item.label;
        existing.hasBaseLabel = true;
      }
    } else {
      // A channel-only entry's label is the channel name (e.g. "DAPI"), not
      // the dataset name - fall back to the path until/unless a base entry
      // shows up, rather than letting a channel string become the header.
      groups.set(key, {
        fsp_name: item.fsp_name,
        path: item.path,
        label: item.channel ? item.path : item.label,
        hasBaseLabel: !item.channel,
        items: [item]
      });
    }
  }
  return Array.from(groups.values()).map(
    ({ hasBaseLabel: _hasBaseLabel, ...group }) => group
  );
}

export default function NGViews() {
  const { allViewsQuery, updateViewMutation, deleteViewMutation } =
    useViewsContext();
  const { cart, cartCount, clearCart } = useCartContext();
  const allProxiedPathsQuery = useAllProxiedPathsQuery();
  const baseUrl = useDefaultNeuroglancerBaseUrl();

  const cartGroups = useMemo(() => groupCartByDataset(cart), [cart]);
  const dataLinkUrlByDataset = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of allProxiedPathsQuery.data ?? []) {
      map.set(datasetKey(p.fsp_name, p.path), p.url);
    }
    return map;
  }, [allProxiedPathsQuery.data]);

  const handleClearCart = async () => {
    try {
      await clearCart();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Clear failed');
    }
  };

  const [tab, setTab] = useState<ViewsTab>('views');
  const [renameItem, setRenameItem] = useState<View | undefined>(undefined);
  const [renameValue, setRenameValue] = useState('');
  const [deleteItem, setDeleteItem] = useState<View | undefined>(undefined);

  const handleOpenRename = (item: View) => {
    setRenameItem(item);
    setRenameValue(item.name);
  };
  const handleCloseRename = () => setRenameItem(undefined);

  const handleConfirmRename = async () => {
    if (!renameItem) {
      return;
    }
    try {
      await updateViewMutation.mutateAsync({
        short_key: renameItem.short_key,
        name: renameValue.trim()
      });
      toast.success('View renamed');
      handleCloseRename();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Rename failed');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteItem) {
      return;
    }
    try {
      await deleteViewMutation.mutateAsync(deleteItem.short_key);
      toast.success('View deleted');
      setDeleteItem(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    }
  };

  const columns = useNGViewsColumns(handleOpenRename, setDeleteItem, baseUrl);

  const tabClass = (active: boolean) =>
    `flex items-center gap-2 px-4 py-2 border-b-2 ${
      active
        ? 'border-primary text-foreground font-semibold'
        : 'border-transparent text-foreground/70'
    }`;

  return (
    <>
      <div className="w-full">
        <Typography className="mb-2 text-foreground font-bold" type="h5">
          Neuroglancer Views
        </Typography>
        <Typography className="mb-4 text-foreground">
          Saved Neuroglancer Views and your working Layer Cart.
        </Typography>

        {/* ponytail: local-state tab bar, not the AppsLayout resizable rail —
            two tabs don't need panels. */}
        <div className="flex gap-2 mb-4 border-b border-surface">
          <button
            className={tabClass(tab === 'views')}
            onClick={() => setTab('views')}
            type="button"
          >
            Saved Views
          </button>
          <button
            className={tabClass(tab === 'cart')}
            onClick={() => setTab('cart')}
            type="button"
          >
            Layer Cart
            {cartCount > 0 ? (
              <FgBadge color="secondary" size="sm" variant="pill">
                {cartCount > 9 ? '9+' : cartCount}
              </FgBadge>
            ) : null}
          </button>
        </div>

        {tab === 'views' ? (
          <TableCard
            columns={columns}
            data={allViewsQuery.data || []}
            dataType="NG views"
            errorState={allViewsQuery.error}
            gridColsClass="grid-cols-[2fr_0.6fr_1fr_1fr_0.6fr]"
            loadingState={allViewsQuery.isPending}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {cart.length === 0 ? (
              <Typography className="text-foreground/70">
                Your Layer Cart is empty. Add datasets from the file browser.
              </Typography>
            ) : (
              <>
                {cartGroups.map(group => (
                  <CartDatasetRow
                    dataLinkUrl={dataLinkUrlByDataset.get(
                      datasetKey(group.fsp_name, group.path)
                    )}
                    fsp_name={group.fsp_name}
                    items={group.items}
                    key={datasetKey(group.fsp_name, group.path)}
                    label={group.label}
                    path={group.path}
                  />
                ))}
                <div className="flex gap-3">
                  <CreateViewButton
                    datasets={cart}
                    defaultName="New View"
                    label="Create View"
                  />
                  <FgButton
                    onClick={() => void handleClearCart()}
                    variant="ghost"
                  >
                    Clear cart
                  </FgButton>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {renameItem ? (
        <FgDialog
          className="flex flex-col gap-4"
          onClose={handleCloseRename}
          open={!!renameItem}
        >
          <Typography className="text-foreground font-semibold">
            Rename View
          </Typography>
          <FgInput
            aria-label="View name"
            onChange={e => setRenameValue(e.target.value)}
            value={renameValue}
          />
          <div className="flex gap-3">
            <FgButton
              disabled={
                updateViewMutation.isPending || renameValue.trim() === ''
              }
              loading={updateViewMutation.isPending}
              loadingText="Saving..."
              onClick={handleConfirmRename}
            >
              Save
            </FgButton>
            <FgButton onClick={handleCloseRename} variant="ghost">
              Cancel
            </FgButton>
          </div>
        </FgDialog>
      ) : null}

      {deleteItem ? (
        <FgDialog
          className="flex flex-col gap-4"
          onClose={() => setDeleteItem(undefined)}
          open={!!deleteItem}
        >
          <Typography className="text-foreground font-semibold">
            Are you sure you want to delete "
            {deleteItem.name || deleteItem.short_key}"?
          </Typography>
          <div className="flex gap-3">
            <FgButton
              color="error"
              disabled={deleteViewMutation.isPending}
              loading={deleteViewMutation.isPending}
              loadingText="Deleting..."
              onClick={handleConfirmDelete}
            >
              Delete
            </FgButton>
            <FgButton onClick={() => setDeleteItem(undefined)} variant="ghost">
              Cancel
            </FgButton>
          </div>
        </FgDialog>
      ) : null}
    </>
  );
}
