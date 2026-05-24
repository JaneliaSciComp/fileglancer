import { Card, IconButton, Typography } from '@material-tailwind/react';
import {
  HiOutlineExternalLink,
  HiOutlinePlus,
  HiOutlineTrash
} from 'react-icons/hi';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import type { AppListing } from '@/shared.types';

function buildSourceUrl(listing: AppListing): string {
  const repo = listing.url.replace(/\/+$/, '');
  const isGitHub = /^https?:\/\/(www\.)?github\.com\//i.test(repo);
  if (!isGitHub) {
    return repo;
  }
  const branch = listing.branch?.trim();
  const path = listing.manifest_path?.trim();
  if (branch && path) {
    return `${repo}/tree/${branch}/${path}`;
  }
  if (branch) {
    return `${repo}/tree/${branch}`;
  }
  if (path) {
    return `${repo}/tree/HEAD/${path}`;
  }
  return repo;
}

interface ListingCardProps {
  readonly listing: AppListing;
  readonly canAdd: boolean;
  readonly canManage: boolean;
  readonly adding: boolean;
  readonly unsharing: boolean;
  readonly onAdd: (listing: AppListing) => void;
  readonly onUnshare: (listing: AppListing) => void;
}

export default function ListingCard({
  listing,
  canAdd,
  canManage,
  adding,
  unsharing,
  onAdd,
  onUnshare
}: ListingCardProps) {
  const sourceUrl = buildSourceUrl(listing);
  const publishedAt = new Date(listing.published_at).toLocaleDateString();

  return (
    <Card className="p-4 flex flex-col gap-3 text-left w-full dark:border-surface-light">
      <div className="flex items-start justify-between gap-2">
        <Typography
          className="text-foreground font-semibold truncate"
          type="h6"
        >
          {listing.name}
        </Typography>
        {canManage ? (
          <FgTooltip label="Unshare from catalog">
            <IconButton
              className="text-foreground hover:text-error flex-shrink-0"
              disabled={unsharing}
              onClick={() => onUnshare(listing)}
              size="sm"
              variant="ghost"
            >
              <FgIcon icon={HiOutlineTrash} />
            </IconButton>
          </FgTooltip>
        ) : null}
      </div>

      <Typography className="text-foreground text-xs" type="small">
        Shared by {listing.owner_username} on {publishedAt}
      </Typography>

      {listing.description ? (
        <Typography className="text-sm text-foreground">
          {listing.description}
        </Typography>
      ) : null}

      <a
        className="text-primary hover:underline text-xs inline-flex items-center gap-1 break-all"
        href={sourceUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        <FgIcon icon={HiOutlineExternalLink} size="xs" />
        <span>
          {listing.url.replace(/^https?:\/\//, '')}
          {listing.manifest_path ? ` / ${listing.manifest_path}` : ''}
          {listing.branch ? ` @ ${listing.branch}` : ''}
        </span>
      </a>

      <div className="mt-auto">
        {canAdd ? (
          <FgButton
            disabled={adding}
            icon={HiOutlinePlus}
            loading={adding}
            loadingText="Adding..."
            onClick={() => onAdd(listing)}
            size="sm"
          >
            Add to my apps
          </FgButton>
        ) : (
          <Typography className="text-foreground text-xs italic" type="small">
            Already in your apps
          </Typography>
        )}
      </div>
    </Card>
  );
}
