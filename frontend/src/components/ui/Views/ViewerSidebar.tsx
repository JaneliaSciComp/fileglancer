import { IconButton, Typography } from '@material-tailwind/react';
import { HiX } from 'react-icons/hi';

import FgButton from '@/components/designSystem/atoms/FgButton';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import CartList from '@/components/ui/Views/CartList';
import { useAddToView } from '@/hooks/useAddToView';
import { useCreateViewFlow } from '@/hooks/useCreateViewFlow';
import type { NeuroglancerBridge } from '@/hooks/useNeuroglancerViewer';

type ViewerSidebarProps = {
  readonly bridge: NeuroglancerBridge;
  /** Called after layers were added to the viewer's state. */
  readonly onEdited: () => void;
  readonly onClose: () => void;
};

/** The owner's "Add data" panel beside the embedded viewer. */
export default function ViewerSidebar({
  bridge,
  onEdited,
  onClose
}: ViewerSidebarProps) {
  const addToView = useAddToView(bridge, onEdited);
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
