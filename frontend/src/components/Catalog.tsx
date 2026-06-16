import { useMemo, useState } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import ListingCard from '@/components/ui/AppsPage/ListingCard';
import {
  useAppsQuery,
  useAddFromListingMutation,
  useCatalogQuery,
  useUnshareListingMutation
} from '@/queries/appsQueries';
import { useProfileContext } from '@/contexts/ProfileContext';
import type { AppListing } from '@/shared.types';

export default function Catalog() {
  const [search, setSearch] = useState('');

  const catalogQuery = useCatalogQuery();
  const appsQuery = useAppsQuery();
  const { profile } = useProfileContext();

  const addFromListingMutation = useAddFromListingMutation();
  const unshareListingMutation = useUnshareListingMutation();

  const myAppKeys = useMemo(() => {
    const set = new Set<string>();
    (appsQuery.data ?? []).forEach(a =>
      set.add(`${a.url}::${a.manifest_path}`)
    );
    return set;
  }, [appsQuery.data]);

  const filteredListings = useMemo(() => {
    const term = search.trim().toLowerCase();
    const listings = catalogQuery.data ?? [];
    if (!term) {
      return listings;
    }
    return listings.filter(l => {
      return (
        l.name.toLowerCase().includes(term) ||
        (l.description ?? '').toLowerCase().includes(term) ||
        l.owner_username.toLowerCase().includes(term)
      );
    });
  }, [catalogQuery.data, search]);

  const handleAddFromListing = async (listing: AppListing) => {
    try {
      await addFromListingMutation.mutateAsync({ listing_id: listing.id });
      toast.success(`Added "${listing.name}"`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add app');
    }
  };

  const handleUnshare = async (listing: AppListing) => {
    try {
      await unshareListingMutation.mutateAsync({ listing_id: listing.id });
      toast.success('Listing removed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to unshare');
    }
  };

  const totalListings = catalogQuery.data?.length ?? 0;

  return (
    <div>
      <Typography className="mb-6 text-foreground">
        Browse apps shared by other users. Click &quot;Add to my apps&quot; to
        get your own copy.
      </Typography>

      <div className="mb-6">
        <input
          className="w-full sm:max-w-sm p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary"
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, description, or sharer"
          type="text"
          value={search}
        />
      </div>

      {catalogQuery.isPending ? (
        <Typography className="text-foreground mb-6" type="small">
          Loading catalog...
        </Typography>
      ) : catalogQuery.isError ? (
        <div className="mb-6 p-3 bg-error/10 rounded text-error text-sm">
          Failed to load catalog:{' '}
          {catalogQuery.error?.message || 'Unknown error'}
        </div>
      ) : totalListings === 0 ? (
        <div className="mb-8 p-6 border border-dashed border-primary-light rounded-lg text-center">
          <Typography className="text-foreground" type="small">
            No shared apps yet. Add an app from a GitHub URL on the Apps page,
            then share it to populate the catalog.
          </Typography>
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="mb-8 p-6 border border-dashed border-primary-light rounded-lg text-center">
          <Typography className="text-foreground" type="small">
            No listings match &quot;{search}&quot;.
          </Typography>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {filteredListings.map(listing => {
            const key = `${listing.url}::${listing.manifest_path}`;
            const alreadyAdded = myAppKeys.has(key);
            const isOwner =
              profile?.username !== undefined &&
              profile.username === listing.owner_username;
            const isAdding =
              addFromListingMutation.isPending &&
              addFromListingMutation.variables?.listing_id === listing.id;
            const isUnsharing =
              unshareListingMutation.isPending &&
              unshareListingMutation.variables?.listing_id === listing.id;
            return (
              <ListingCard
                adding={isAdding}
                canAdd={!alreadyAdded}
                canManage={isOwner}
                key={listing.id}
                listing={listing}
                onAdd={handleAddFromListing}
                onUnshare={handleUnshare}
                unsharing={isUnsharing}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
