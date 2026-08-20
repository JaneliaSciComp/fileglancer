import { useState } from 'react';
import { Link } from 'react-router';
import { Collapse, IconButton, Typography } from '@material-tailwind/react';
import { HiChevronRight, HiOutlineTrash } from 'react-icons/hi';
import { HiExclamationTriangle } from 'react-icons/hi2';
import toast from 'react-hot-toast';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgCheckbox from '@/components/designSystem/atoms/formElements/FgCheckbox';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import ZarrAxisTable from '@/components/ui/BrowsePage/ZarrAxisTable';
import { useCartContext } from '@/contexts/CartContext';
import { getOmeZarrChannels, getOmeZarrMetadata } from '@/omezarr-helper';
import type { Metadata } from '@/omezarr-helper';
import { makeBrowseLink } from '@/utils';
import { getFileURL } from '@/utils/pathHandling';
import type { CartItem } from '@/contexts/CartContext';

interface CartDatasetRowProps {
  readonly fsp_name: string;
  readonly path: string;
  readonly label: string;
  readonly items: CartItem[];
  readonly mismatch?: boolean;
}

// ponytail: two-level dataset->channel tree via MT Collapse (no generic
// TreeView exists). Metadata/channels are fetched from the internal
// /api/content URL (credentialed), so no Data Link is required to inspect
// dimensions or pick channels. Non-Zarr/N5 datasets fail gracefully in
// getOmeZarrChannels (toast) instead of a hard pre-check.
export default function CartDatasetRow({
  fsp_name,
  path,
  label,
  items,
  mismatch
}: CartDatasetRowProps) {
  const { addToCart, removeFromCart, removeManyFromCart } = useCartContext();
  const [isOpen, setIsOpen] = useState(false);
  const [channels, setChannels] = useState<string[] | undefined>(undefined);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const checkedChannels = new Set(
    items.map(item => item.channel).filter((c): c is string => Boolean(c))
  );

  const handleToggleOpen = async () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (!nextOpen) {
      return;
    }
    const dataUrl = getFileURL(fsp_name, path);
    if (channels === undefined && !loadingChannels) {
      setLoadingChannels(true);
      try {
        setChannels(await getOmeZarrChannels(dataUrl));
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Failed to load channels'
        );
        setChannels([]);
      } finally {
        setLoadingChannels(false);
      }
    }
    if (metadata === null && !loadingMeta) {
      setLoadingMeta(true);
      try {
        setMetadata(await getOmeZarrMetadata(dataUrl));
      } catch {
        // Metadata is a nice-to-have here; ignore fetch failures.
      } finally {
        setLoadingMeta(false);
      }
    }
  };

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
    <div className="border-b border-surface py-2">
      <div className="flex items-center justify-between gap-2">
        <button
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          onClick={() => void handleToggleOpen()}
          type="button"
        >
          <FgIcon
            className={isOpen ? 'rotate-90' : ''}
            icon={HiChevronRight}
            size="sm"
          />
          <Typography className="text-foreground truncate">{label}</Typography>
          {mismatch ? (
            <FgTooltip label="Dimensions differ from the first layer in this view">
              <FgIcon
                className="text-warning shrink-0"
                icon={HiExclamationTriangle}
                size="sm"
              />
            </FgTooltip>
          ) : null}
        </button>
        <IconButton
          aria-label="Remove dataset"
          onClick={() => void handleRemoveDataset()}
          variant="ghost"
        >
          <FgIcon color="error" icon={HiOutlineTrash} size="sm" />
        </IconButton>
      </div>
      <Link
        className="block pl-6 text-primary text-xs truncate hover:underline"
        to={makeBrowseLink(fsp_name, path)}
      >
        {path}
      </Link>

      <Collapse open={isOpen}>
        <div className="pl-6 flex flex-col gap-2 pt-2">
          {metadata ? <ZarrAxisTable metadata={metadata} /> : null}
          <div className="flex flex-col gap-1">
            <Typography className="text-foreground/70 text-xs font-semibold">
              Optional: select channels to create per-channel layers
            </Typography>
            {loadingChannels ? (
              <Typography className="text-foreground/70 text-sm">
                Loading channels...
              </Typography>
            ) : (
              (channels ?? []).map((channel, index) => (
                <FgCheckbox
                  checked={checkedChannels.has(channel)}
                  key={channel}
                  label={channel}
                  onChange={e =>
                    void handleToggleChannel(channel, index, e.target.checked)
                  }
                />
              ))
            )}
          </div>
        </div>
      </Collapse>
    </div>
  );
}
