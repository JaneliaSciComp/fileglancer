import { useState } from 'react';
import { Collapse, Typography } from '@material-tailwind/react';
import { HiChevronRight } from 'react-icons/hi';
import toast from 'react-hot-toast';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgCheckbox from '@/components/designSystem/atoms/formElements/FgCheckbox';
import { useCartContext } from '@/contexts/CartContext';
import { getOmeZarrChannels } from '@/omezarr-helper';
import type { CartItem } from '@/contexts/CartContext';

interface CartDatasetRowProps {
  readonly fsp_name: string;
  readonly path: string;
  readonly label: string;
  readonly items: CartItem[];
  readonly dataLinkUrl: string | undefined;
}

// ponytail: two-level dataset->channel tree via MT Collapse (no generic
// TreeView exists). Channel URL comes from an existing Data Link; if a
// dataset has no link yet, expansion is disabled with a hint rather than
// creating a link just to browse channels. Non-Zarr/N5 datasets simply fail
// getOmeZarrChannels gracefully (toast) instead of a hard pre-check.
export default function CartDatasetRow({
  fsp_name,
  path,
  label,
  items,
  dataLinkUrl
}: CartDatasetRowProps) {
  const { addToCart, removeFromCart } = useCartContext();
  const [isOpen, setIsOpen] = useState(false);
  const [channels, setChannels] = useState<string[] | undefined>(undefined);
  const [loadingChannels, setLoadingChannels] = useState(false);

  const checkedChannels = new Set(
    items.map(item => item.channel).filter((c): c is string => Boolean(c))
  );

  const handleToggleOpen = async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && channels === undefined && !loadingChannels && dataLinkUrl) {
      setLoadingChannels(true);
      try {
        setChannels(await getOmeZarrChannels(dataLinkUrl));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to load channels'
        );
        setChannels([]);
      } finally {
        setLoadingChannels(false);
      }
    }
  };

  const handleRemoveDataset = async () => {
    try {
      for (const item of items) {
        await removeFromCart(item.path, item.channel);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to remove dataset'
      );
    }
  };

  const handleToggleChannel = async (channel: string, checked: boolean) => {
    try {
      if (checked) {
        await addToCart([{ fsp_name, path, channel, label: channel }]);
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
    <div className="border-b border-surface py-2">
      <div className="flex items-center justify-between gap-2">
        <button
          className="flex items-center gap-2 flex-1 min-w-0 text-left disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!dataLinkUrl}
          onClick={() => void handleToggleOpen()}
          type="button"
        >
          <FgIcon
            className={isOpen ? 'rotate-90' : ''}
            icon={HiChevronRight}
            size="sm"
          />
          <Typography className="text-foreground truncate">{label}</Typography>
        </button>
        <FgButton onClick={() => void handleRemoveDataset()} variant="ghost">
          Remove
        </FgButton>
      </div>

      {dataLinkUrl ? (
        <Collapse open={isOpen}>
          <div className="pl-6 flex flex-col gap-1 pt-2">
            {loadingChannels ? (
              <Typography className="text-foreground/70 text-sm">
                Loading channels...
              </Typography>
            ) : (
              (channels ?? []).map(channel => (
                <FgCheckbox
                  checked={checkedChannels.has(channel)}
                  key={channel}
                  label={channel}
                  onChange={e =>
                    void handleToggleChannel(channel, e.target.checked)
                  }
                />
              ))
            )}
          </div>
        </Collapse>
      ) : (
        <Typography className="text-foreground/70 text-sm pl-6">
          Channels load after the View is created.
        </Typography>
      )}
    </div>
  );
}
