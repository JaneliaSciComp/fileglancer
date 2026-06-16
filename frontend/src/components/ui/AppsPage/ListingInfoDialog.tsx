import { Typography } from '@material-tailwind/react';
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import type { AppListing } from '@/shared.types';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';

interface ListingInfoDialogProps {
  readonly listing: AppListing;
  readonly open: boolean;
  readonly canAdd: boolean;
  readonly canManage: boolean;
  readonly adding: boolean;
  readonly unsharing: boolean;
  readonly onClose: () => void;
  readonly onAdd: () => void;
  readonly onUnshare: () => void;
}

function ListingInfoTable({ listing }: { readonly listing: AppListing }) {
  const labelClass =
    'text-foreground font-medium pr-4 py-1.5 align-top whitespace-nowrap';
  const valueClass = 'text-foreground py-1.5';

  const publishedAt = new Date(listing.published_at).toLocaleDateString();

  return (
    <table className="w-full text-sm mb-6">
      <tbody>
        <tr>
          <td className={labelClass}>URL</td>
          <td className="py-1.5">
            <FgExternalLink className="break-all" href={listing.url}>
              {listing.url}
            </FgExternalLink>
          </td>
        </tr>
        {listing.branch ? (
          <tr>
            <td className={labelClass}>Branch</td>
            <td className={valueClass}>{listing.branch}</td>
          </tr>
        ) : null}
        <tr>
          <td className={labelClass}>Shared by</td>
          <td className={valueClass}>
            {listing.owner_username} on {publishedAt}
          </td>
        </tr>
        {listing.description ? (
          <tr>
            <td className={labelClass}>Description</td>
            <td className={valueClass}>{listing.description}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export default function ListingInfoDialog({
  listing,
  open,
  canAdd,
  canManage,
  adding,
  unsharing,
  onClose,
  onAdd,
  onUnshare
}: ListingInfoDialogProps) {
  return (
    <FgDialog className="max-w-2xl" onClose={onClose} open={open}>
      <Typography className="text-foreground font-bold mb-4 pr-8" type="h6">
        {listing.name}
      </Typography>

      <ListingInfoTable listing={listing} />

      <div className="flex justify-between">
        {canAdd ? (
          <FgButton icon={HiOutlinePlus} loading={adding} onClick={onAdd}>
            Add to my apps
          </FgButton>
        ) : (
          <Typography
            className="text-foreground text-sm italic self-center"
            type="small"
          >
            Already in your apps
          </Typography>
        )}
        <div className="flex gap-2">
          {canManage ? (
            <FgButton
              className="!rounded-md"
              color="error"
              disabled={unsharing}
              icon={HiOutlineTrash}
              loading={unsharing}
              loadingText="Unsharing..."
              onClick={onUnshare}
              variant="outline"
            >
              Unshare
            </FgButton>
          ) : null}
        </div>
      </div>
    </FgDialog>
  );
}
