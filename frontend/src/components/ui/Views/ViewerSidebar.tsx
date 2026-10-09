import { useMemo, useState } from 'react';
import { IconButton, Tabs } from '@material-tailwind/react';
import { HiX } from 'react-icons/hi';

import FgButton from '@/components/designSystem/atoms/FgButton';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import CartList from '@/components/ui/Views/CartList';
import SidebarFileBrowser from '@/components/ui/Views/SidebarFileBrowser';
import { useAddToView } from '@/hooks/useAddToView';
import { useCartCount } from '@/hooks/useCartCount';
import { useCreateViewFlow } from '@/hooks/useCreateViewFlow';
import { isUnsupportedLayer } from '@/utils/viewCheckout';
import type { NeuroglancerBridge } from '@/hooks/useNeuroglancerViewer';
import type { ViewLayer } from '@/queries/viewQueries';

type ViewerSidebarProps = {
  readonly bridge: NeuroglancerBridge;
  /** The View's saved layer rows. */
  readonly viewLayers: ViewLayer[];
  /** Called after layers were added to the viewer's state. */
  readonly onEdited: () => void;
  /** Called with the Data Links of datasets that can't load as layers. */
  readonly onAddSources: (sharingKeys: string[]) => void;
  readonly onClose: () => void;
};

/** The owner's "Add data" panel beside the embedded viewer. */
export default function ViewerSidebar({
  bridge,
  viewLayers,
  onEdited,
  onAddSources,
  onClose
}: ViewerSidebarProps) {
  const addToView = useAddToView(bridge, {
    viewLayers,
    onEdited,
    onAddSources
  });
  const { startAddToView, dialog, pending } = useCreateViewFlow();
  const [tab, setTab] = useState('add');
  const cartCount = useCartCount();
  const viewSources = useMemo(
    () =>
      [...viewLayers]
        .sort((a, b) => a.layer_index - b.layer_index)
        .flatMap(l =>
          l.fsp_name !== null && l.path !== null && !isUnsupportedLayer(l)
            ? [{ fsp_name: l.fsp_name, path: l.path }]
            : []
        ),
    [viewLayers]
  );

  // Both tabs stay mounted (MT's Tabs.Panel unmounts inactive panels) so
  // switching keeps the browser's folder and checks.
  return (
    <aside aria-label="Layer Cart sidebar" className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 bg-surface pr-2 dark:bg-surface-light">
        {/* Content-width triggers, as in the Properties panel: MT measures
            the indicator only on window resize, so triggers that stretch
            with the panel, or wrap when it narrows, would leave it behind. */}
        <Tabs className="min-w-0 flex-1" onValueChange={setTab} value={tab}>
          <Tabs.List className="justify-start items-stretch shrink-0 min-w-fit w-full py-2 bg-surface dark:bg-surface-light">
            <Tabs.Trigger
              className="!text-foreground h-full whitespace-nowrap"
              value="add"
            >
              Add data
            </Tabs.Trigger>
            <Tabs.Trigger
              className="!text-foreground h-full gap-1.5 whitespace-nowrap"
              value="cart"
            >
              Layer Cart
              {/* Always rendered, so the trigger keeps its width (and the
                  indicator its fit) as the count comes and goes. */}
              <span
                aria-hidden={cartCount === 0}
                aria-label={`${cartCount} ${cartCount === 1 ? 'dataset' : 'datasets'}`}
                className={`min-w-4 rounded-full bg-secondary px-1 text-center text-[10px] leading-4 text-secondary-foreground ${cartCount > 0 ? '' : 'invisible'}`}
              >
                {cartCount}
              </span>
            </Tabs.Trigger>
            <Tabs.TriggerIndicator className="h-full" />
          </Tabs.List>
        </Tabs>
        <IconButton
          aria-label="Close sidebar"
          onClick={onClose}
          size="sm"
          variant="ghost"
        >
          <FgIcon icon={HiX} />
        </IconButton>
      </div>
      <div
        aria-label="Add data"
        className={`min-h-0 flex-1 flex-col overflow-y-auto p-3 ${tab === 'add' ? 'flex' : 'hidden'}`}
        role="tabpanel"
      >
        <SidebarFileBrowser />
      </div>
      <div
        aria-label="Layer Cart"
        className={`min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 ${tab === 'cart' ? 'flex' : 'hidden'}`}
        role="tabpanel"
      >
        <CartList
          action={({ cart, hasMismatch, checking }) => (
            <FgButton
              // The mismatch check isn't final until every dataset is probed.
              disabled={pending || checking}
              loading={pending}
              loadingText="Adding..."
              onClick={() => startAddToView(cart, hasMismatch, addToView)}
            >
              Add to this View
            </FgButton>
          )}
          viewSources={viewSources}
        />
      </div>
      {dialog}
    </aside>
  );
}
