import { Typography } from '@material-tailwind/react';
import { PiLinkSimpleBold } from 'react-icons/pi';

import type { FileSharePath } from '@/shared.types';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import { makeMapKey } from '@/utils';
import DashboardCard from '@/components/ui/BrowsePage/Dashboard/FgDashboardCard';
import Folder from '@/components/ui/Sidebar/Folder';
import { SidebarItemSkeleton } from '@/components/ui/widgets/Loaders';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';

export default function RecentDataLinksCard() {
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const { allProxiedPaths, loadingProxiedPaths } = useProxiedPathContext();

  // Get the 10 most recent data links
  const recentDataLinks = allProxiedPaths.slice(0, 10) || [];

  return (
    <DashboardCard title="Recently created data links">
      {loadingProxiedPaths || zonesAndFspQuery.isPending ? (
        Array(5)
          .fill(0)
          .map((_, index) => (
            <SidebarItemSkeleton key={index} withEndIcon={false} />
          ))
      ) : recentDataLinks.length === 0 ? (
        <div className="px-6 pt-2 flex flex-col gap-4">
          <Typography className="text-muted-foreground">
            No data links created yet.
          </Typography>
          <Typography className="text-muted-foreground">
            Data links allow you to open Zarr files in external viewers like
            Neuroglancer. You can share data links with internal collaborators.
          </Typography>
          <Typography className="text-muted-foreground">
            Create a data link by navigating to any Zarr folder in the file
            browser and clicking the "Data Link" toggle.
          </Typography>
        </div>
      ) : zonesAndFspQuery.isError ? (
        <div className="px-4 pt-4 flex flex-col gap-4">
          <Typography className="text-error">
            Error loading zones and file share paths:{' '}
            {zonesAndFspQuery.error.message}
          </Typography>
        </div>
      ) : recentDataLinks.length > 0 ? (
        <>
          {recentDataLinks.map((item: ProxiedPath) => {
            const fspKey = makeMapKey('fsp', item.fsp_name);
            const fsp = zonesAndFspQuery.data[fspKey] as FileSharePath;
            if (!fsp) {
              return null;
            }
            return (
              <Folder
                folderPath={item.path}
                fsp={fsp}
                icon={
                  <PiLinkSimpleBold className="icon-small short:icon-xsmall stroke-2" />
                }
                isFavoritable={false}
                key={item.sharing_key}
              />
            );
          })}
        </>
      ) : null}
    </DashboardCard>
  );
}
