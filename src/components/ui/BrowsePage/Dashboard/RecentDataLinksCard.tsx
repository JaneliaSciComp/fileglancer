import { Typography } from '@material-tailwind/react';

import DashboardCard from '@/components/ui/BrowsePage/Dashboard/FgDashboardCard';
import { linksColumns } from '@/components/ui/Table/linksColumns';
import { Table } from '@/components/ui/Table/TableCard';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';

export default function RecentDataLinksCard() {
  const { allProxiedPaths, loadingProxiedPaths } = useProxiedPathContext();

  // Get the 10 most recent data links
  const recentDataLinks = allProxiedPaths?.slice(0, 10) || [];

  return (
    <DashboardCard title="Recently created data links">
      {recentDataLinks.length === 0 ? (
        <div className="px-4 pt-4 flex flex-col gap-4">
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
      ) : (
        <Table
          columns={linksColumns}
          data={recentDataLinks || []}
          emptyText="No shared paths."
          gridColsClass="grid-cols-[1.5fr_2.5fr_1.5fr_1fr_1fr]"
          loadingState={loadingProxiedPaths}
        />
      )}
    </DashboardCard>
  );
}
