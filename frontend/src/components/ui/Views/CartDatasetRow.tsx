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
}

/** A cart dataset: removable, with its channels pickable as layers. */
export default function CartDatasetRow({
  fsp_name,
  path,
  label,
  items,
  mismatch,
  kind
}: CartDatasetRowProps) {
  const { addToCart, removeFromCart, removeManyFromCart } = useCartContext();

  const checkedChannels = new Set(
    items.map(item => item.channel).filter((c): c is string => Boolean(c))
  );

  const handleRemoveDataset = async () => {
    try {
      await removeManyFromCart(
        items.map(item => ({ path: item.path, channel: item.channel }))
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
        await removeFromCart(path, channel);
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
      onRemove={() => void handleRemoveDataset()}
      path={path}
      renderChannels={channels => (
        <div className="flex flex-col gap-1">
          <Typography className="text-foreground/70 text-xs font-semibold">
            Optional: select channels to create per-channel layers
          </Typography>
          {channels.map((channel, index) => (
            <FgCheckbox
              checked={checkedChannels.has(channel)}
              key={channel}
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
