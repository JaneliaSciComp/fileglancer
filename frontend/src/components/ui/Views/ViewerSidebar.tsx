import { IconButton, Typography } from '@material-tailwind/react';
import { HiX } from 'react-icons/hi';

import FgButton from '@/components/designSystem/atoms/FgButton';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import CartList from '@/components/ui/Views/CartList';
import { useAddToView } from '@/hooks/useAddToView';
import { useCreateViewFlow } from '@/hooks/useCreateViewFlow';
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

  return (
    <aside
      aria-label="Layer Cart sidebar"
      className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto border-r border-surface p-3"
    >
      <div className="flex items-center justify-between">
        <Typography className="font-semibold text-foreground">
          Layer Cart
        </Typography>
        <IconButton
          aria-label="Close sidebar"
          onClick={onClose}
          size="sm"
          variant="ghost"
        >
          <FgIcon icon={HiX} />
        </IconButton>
      </div>
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
      />
      {dialog}
    </aside>
  );
}
