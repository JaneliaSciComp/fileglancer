import { useMemo, useState } from 'react';
import { Typography } from '@material-tailwind/react';

import ListingCard from '@/components/ui/AppsPage/ListingCard';
import FgCheckbox from '@/components/designSystem/atoms/formElements/FgCheckbox';
import { useAppsQuery, useCatalogQuery } from '@/queries/appsQueries';
import { useListingActions } from '@/hooks/useListingActions';
import { useProfileContext } from '@/contexts/ProfileContext';
import type { UserApp } from '@/shared.types';

export default function Catalog() {
  const [search, setSearch] = useState('');
  const [hideInstalled, setHideInstalled] = useState(false);

  const catalogQuery = useCatalogQuery();
  const appsQuery = useAppsQuery();
  const { profile } = useProfileContext();
  const actions = useListingActions();

  const myAppsByKey = useMemo(() => {
    const map = new Map<string, UserApp>();
    (appsQuery.data ?? []).forEach(a =>
      map.set(`${a.url}::${a.manifest_path}`, a)
    );
    return map;
  }, [appsQuery.data]);

  const filteredListings = useMemo(() => {
    const term = search.trim().toLowerCase();
    const listings = catalogQuery.data ?? [];
    return listings.filter(l => {
      if (hideInstalled && myAppsByKey.has(`${l.url}::${l.manifest_path}`)) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        l.name.toLowerCase().includes(term) ||
        (l.description ?? '').toLowerCase().includes(term) ||
        l.owner_username.toLowerCase().includes(term)
      );
    });
  }, [catalogQuery.data, search, hideInstalled, myAppsByKey]);

  const totalListings = catalogQuery.data?.length ?? 0;

  return (
    <div>
      <Typography className="mb-6 text-foreground">
        Browse shared apps. Click &quot;Add to my apps&quot; to get your own
        copy, or manage listings you have shared.
      </Typography>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          className="w-full sm:max-w-sm p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary"
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, description, or sharer"
          type="text"
          value={search}
        />
        <FgCheckbox
          checked={hideInstalled}
          label="Hide already installed apps"
          onChange={e => setHideInstalled(e.target.checked)}
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
            {search.trim()
              ? `No listings match "${search}".`
              : 'All shared apps are already in your apps.'}
          </Typography>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {filteredListings.map(listing => {
            const installedApp = myAppsByKey.get(
              `${listing.url}::${listing.manifest_path}`
            );
            const isOwner =
              profile?.username !== undefined &&
              profile.username === listing.owner_username;
            return (
              <ListingCard
                actions={actions}
                canManage={isOwner}
                installedApp={installedApp}
                key={listing.id}
                listing={listing}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
