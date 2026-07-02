import type { KeyboardEvent } from 'react';
import { Card, Typography } from '@material-tailwind/react';
import { HiOutlinePlus } from 'react-icons/hi';
import { HiOutlineEllipsisVertical } from 'react-icons/hi2';

import DataLinksActionsMenu from '@/components/ui/Menus/DataLinksActions';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import type { ListingActions } from '@/hooks/useListingActions';
import { formatDateString, getAppIconType } from '@/utils';
import type { AppListing, UserApp } from '@/shared.types';

interface ListingCardProps {
  readonly listing: AppListing;
  /** The user's copy of this app, when it is already in their apps. */
  readonly installedApp?: UserApp;
  readonly canManage: boolean;
  readonly actions: ListingActions;
}

export default function ListingCard({
  listing,
  installedApp,
  canManage,
  actions
}: ListingCardProps) {
  const alreadyAdded = installedApp !== undefined;
  const adding = actions.addingId === listing.id;
  const publishedAt = formatDateString(listing.published_at);

  const menuItems: MenuItem<AppListing>[] = [
    {
      name: 'Add to my apps',
      action: l => void actions.add(l),
      shouldShow: !alreadyAdded
    },
    { name: 'View', action: l => actions.view(l) },
    {
      name: 'View in My Apps',
      action: () => installedApp && actions.viewInMyApps(installedApp),
      shouldShow: alreadyAdded
    },
    {
      name: 'Unshare',
      action: l => void actions.unshare(l),
      color: 'text-error',
      shouldShow: canManage
    }
  ];

  const handleView = () => actions.view(listing);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      event.target === event.currentTarget
    ) {
      event.preventDefault();
      handleView();
    }
  };

  return (
    <Card
      className="p-0 flex flex-col text-left w-full dark:border-surface-light cursor-pointer transition-colors hover:bg-surface dark:hover:bg-surface-light"
      onClick={handleView}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
    >
      <div className="px-3 py-2 rounded-t-lg bg-surface dark:bg-surface-light border-b border-surface-light dark:border-surface flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FgIcon
            className="text-foreground flex-shrink-0"
            icon={getAppIconType(installedApp?.manifest)}
          />
          {alreadyAdded ? (
            <span className="inline-block px-2 py-0.5 rounded-sm bg-success/10 text-success text-xs font-medium">
              In your apps
            </span>
          ) : null}
        </div>
        <div
          className="flex items-center gap-1"
          onClick={e => e.stopPropagation()}
        >
          {!alreadyAdded ? (
            <FgTooltip label="Add to my apps">
              <FgButton
                disabled={adding}
                icon={HiOutlinePlus}
                loading={adding}
                loadingText="Adding..."
                onClick={() => void actions.add(listing)}
                size="sm"
              >
                Add
              </FgButton>
            </FgTooltip>
          ) : null}
          <DataLinksActionsMenu<AppListing>
            actionProps={listing}
            menuItems={menuItems}
            triggerIcon={HiOutlineEllipsisVertical}
          />
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <Typography
          className="text-foreground font-semibold truncate"
          type="h6"
        >
          {listing.name}
        </Typography>

        <Typography className="text-foreground text-xs" type="small">
          Shared by {listing.owner_username} on {publishedAt}
        </Typography>

        {listing.description ? (
          <Typography className="text-sm text-foreground">
            {listing.description}
          </Typography>
        ) : null}
      </div>
    </Card>
  );
}
