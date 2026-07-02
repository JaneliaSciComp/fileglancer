import { useNavigate, useParams } from 'react-router';
import { Typography } from '@material-tailwind/react';
import { HiOutlinePlus } from 'react-icons/hi';
import { HiOutlineEllipsisVertical } from 'react-icons/hi2';

import AppPageHeader from '@/components/ui/AppsPage/AppPageHeader';
import ListingInfoTable from '@/components/ui/AppsPage/ListingInfoTable';
import DataLinksActionsMenu from '@/components/ui/Menus/DataLinksActions';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import FgButton from '@/components/designSystem/atoms/FgButton';
import { useAppsQuery, useCatalogQuery } from '@/queries/appsQueries';
import { useListingActions } from '@/hooks/useListingActions';
import { useProfileContext } from '@/contexts/ProfileContext';
import { getAppIconType } from '@/utils';
import type { AppListing } from '@/shared.types';

const BACK_PROPS = {
  backLabel: 'Back to App Catalog',
  backTo: '/apps/catalog'
};

export default function ListingDetail() {
  const { listingId } = useParams<{ listingId: string }>();
  const navigate = useNavigate();
  const catalogQuery = useCatalogQuery();
  const appsQuery = useAppsQuery();
  const { profile } = useProfileContext();
  const actions = useListingActions({
    onUnshared: () => navigate('/apps/catalog')
  });

  const listing = catalogQuery.data?.find(l => l.id === Number(listingId));

  if (catalogQuery.isPending) {
    return (
      <Typography className="text-foreground" type="small">
        Loading listing...
      </Typography>
    );
  }

  if (catalogQuery.isError) {
    return (
      <div className="p-3 bg-error/10 rounded text-error text-sm">
        Failed to load catalog: {catalogQuery.error?.message || 'Unknown error'}
      </div>
    );
  }

  if (!listing) {
    return (
      <div>
        <AppPageHeader {...BACK_PROPS} title="Listing not found" />
        <Typography className="text-foreground mb-4">
          This catalog listing does not exist. It may have been unshared.
        </Typography>
        <FgButton onClick={() => navigate('/apps/catalog')} variant="outline">
          Go to App Catalog
        </FgButton>
      </div>
    );
  }

  const installedApp = appsQuery.data?.find(
    a => a.url === listing.url && a.manifest_path === listing.manifest_path
  );
  const alreadyAdded = installedApp !== undefined;
  const canManage =
    profile?.username !== undefined &&
    profile.username === listing.owner_username;
  const adding = actions.addingId === listing.id;

  const menuItems: MenuItem<AppListing>[] = [
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
  const hasMenuItems = menuItems.some(item => item.shouldShow !== false);

  return (
    <div>
      <AppPageHeader
        {...BACK_PROPS}
        actions={
          <>
            {!alreadyAdded ? (
              <FgButton
                disabled={adding}
                icon={HiOutlinePlus}
                loading={adding}
                loadingText="Adding..."
                onClick={() => void actions.add(listing)}
                size="sm"
              >
                Add to my apps
              </FgButton>
            ) : null}
            {hasMenuItems ? (
              <DataLinksActionsMenu<AppListing>
                actionProps={listing}
                menuItems={menuItems}
                triggerIcon={HiOutlineEllipsisVertical}
              />
            ) : null}
          </>
        }
        icon={getAppIconType(installedApp?.manifest)}
        title={listing.name}
      >
        {alreadyAdded ? (
          <span className="inline-block px-2 py-0.5 rounded-sm bg-success/10 text-success text-xs font-medium flex-shrink-0">
            In your apps
          </span>
        ) : null}
      </AppPageHeader>

      <div className="max-w-2xl">
        <ListingInfoTable listing={listing} />
      </div>
    </div>
  );
}
