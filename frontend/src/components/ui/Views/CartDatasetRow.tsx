import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgCheckbox from '@/components/designSystem/atoms/formElements/FgCheckbox';
import DatasetRow from '@/components/ui/Views/DatasetRow';
import { useCartContext } from '@/contexts/CartContext';
import type { CartItem } from '@/contexts/CartContext';
import type { DatasetKind } from '@/utils/viewCheckout';

interface CartDatasetRowProps {
  readonly fsp_name: string;
  readonly path: string;
  readonly label: string;
  readonly items: CartItem[];
  readonly mismatch?: boolean;
  readonly kind: DatasetKind | 'loading';
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

/** A cart dataset: removable, with its channels pickable as layers. */
export default function CartDatasetRow({
  fsp_name,
  path,
  label,
  items,
  mismatch,
  kind,
  open,
  onOpenChange
}: CartDatasetRowProps) {
  const { addToCart, removeFromCart, removeManyFromCart } = useCartContext();

  const checkedIndices = new Set(items.map(item => item.channelIndex));

  const handleRemoveDataset = async () => {
    try {
      await removeManyFromCart(
        items.map(item => ({
          path: item.path,
          channelIndex: item.channelIndex
        }))
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to remove dataset'
      );
    }
  };

  const handleToggleChannel = async (
    channel: string,
    index: number,
    checked: boolean
  ) => {
    try {
      if (checked) {
        await addToCart([
          { fsp_name, path, channel, label: channel, channelIndex: index }
        ]);
      } else {
        await removeFromCart(path, index);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to update channel'
      );
    }
  };

  return (
    <DatasetRow
      fsp_name={fsp_name}
      kind={kind}
      label={label}
      mismatch={mismatch}
      onOpenChange={onOpenChange}
      onRemove={() => void handleRemoveDataset()}
      open={open}
      path={path}
      renderChannels={channels => (
        <div className="flex flex-col gap-1">
          <Typography className="text-foreground/70 text-xs font-semibold">
            Optional: select channels to create per-channel layers
          </Typography>
          {channels.map((channel, index) => (
            <FgCheckbox
              checked={checkedIndices.has(index)}
              key={index}
              label={channel}
              onChange={e =>
                void handleToggleChannel(channel, index, e.target.checked)
              }
            />
          ))}
        </div>
      )}
    />
  );
}
