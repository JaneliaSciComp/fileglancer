import { useState } from 'react';
import { Card, IconButton, Typography } from '@material-tailwind/react';
import { HiOutlineInformationCircle, HiOutlinePlus } from 'react-icons/hi';
import { FaUsersSlash } from 'react-icons/fa6';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import ListingInfoDialog from '@/components/ui/AppsPage/ListingInfoDialog';
import { formatDateString } from '@/utils';
import type { AppListing } from '@/shared.types';

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
  const [infoOpen, setInfoOpen] = useState(false);
  const publishedAt = formatDateString(listing.published_at);

  return (
    <Card className="p-4 flex flex-col gap-3 text-left w-full dark:border-surface-light">
      <div className="flex items-start justify-between gap-2">
        <Typography
          className="text-foreground font-semibold truncate"
          type="h6"
        >
          {listing.name}
        </Typography>
        <div className="flex flex-shrink-0">
          <FgTooltip label="App info">
            <IconButton
              className="text-foreground hover:text-primary"
              onClick={() => setInfoOpen(true)}
              size="sm"
              variant="ghost"
            >
              <FgIcon icon={HiOutlineInformationCircle} />
            </IconButton>
          </FgTooltip>
          {canManage ? (
            <FgTooltip label="Unshare from catalog">
              <IconButton
                className="text-foreground hover:text-error"
                disabled={unsharing}
                onClick={() => onUnshare(listing)}
                size="sm"
                variant="ghost"
              >
                <FgIcon icon={FaUsersSlash} />
              </IconButton>
            </FgTooltip>
          ) : null}
        </div>
      </div>

      <Typography className="text-foreground text-xs" type="small">
        Shared by {listing.owner_username} on {publishedAt}
      </Typography>

      {listing.description ? (
        <Typography className="text-sm text-foreground">
          {listing.description}
        </Typography>
      ) : null}

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

      <ListingInfoDialog
        adding={adding}
        canAdd={canAdd}
        canManage={canManage}
        listing={listing}
        onAdd={() => {
          setInfoOpen(false);
          onAdd(listing);
        }}
        onClose={() => setInfoOpen(false)}
        onUnshare={() => onUnshare(listing)}
        open={infoOpen}
        unsharing={unsharing}
      />
    </Card>
  );
}
