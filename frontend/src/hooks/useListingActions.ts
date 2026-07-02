import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';

import {
  useAddFromListingMutation,
  useUnshareListingMutation
} from '@/queries/appsQueries';
import { buildAppDetailPath } from '@/utils';
import type { AppListing, UserApp } from '@/shared.types';

export function buildListingDetailPath(listingId: number): string {
  return `/apps/catalog/${listingId}`;
}

export interface ListingActions {
  view: (listing: AppListing) => void;
  viewInMyApps: (app: UserApp) => void;
  add: (listing: AppListing) => Promise<void>;
  unshare: (listing: AppListing) => Promise<void>;
  /** Listing id the add/unshare mutation is currently running for, if any. */
  addingId: number | null;
  unsharingId: number | null;
}

/**
 * Navigation and mutation handlers for the actions offered on a catalog
 * listing (view details, add to my apps, unshare), shared by the catalog
 * cards and the listing detail page.
 */
export function useListingActions(opts?: {
  onUnshared?: () => void;
}): ListingActions {
  const navigate = useNavigate();
  const addFromListingMutation = useAddFromListingMutation();
  const unshareListingMutation = useUnshareListingMutation();

  const view = (listing: AppListing) => {
    navigate(buildListingDetailPath(listing.id));
  };

  const viewInMyApps = (app: UserApp) => {
    navigate(buildAppDetailPath(app.url, app.manifest_path));
  };

  const add = async (listing: AppListing) => {
    try {
      await addFromListingMutation.mutateAsync({ listing_id: listing.id });
      toast.success(`Added "${listing.name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add app');
    }
  };

  const unshare = async (listing: AppListing) => {
    try {
      await unshareListingMutation.mutateAsync({ listing_id: listing.id });
      toast.success('Removed from catalog');
      opts?.onUnshared?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to unshare');
    }
  };

  return {
    view,
    viewInMyApps,
    add,
    unshare,
    addingId: addFromListingMutation.isPending
      ? (addFromListingMutation.variables?.listing_id ?? null)
      : null,
    unsharingId: unshareListingMutation.isPending
      ? (unshareListingMutation.variables?.listing_id ?? null)
      : null
  };
}
