import { Typography } from '@material-tailwind/react';

import DashboardCard from '@/components/ui/BrowsePage/Dashboard/FgDashboardCard';
import ProxiedPathRow from '@/components/ui/LinksPage/ProxiedPathRow';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';

export default function RecentDataLinksCard() {
  const { allProxiedPaths } = useProxiedPathContext();

  // Get the 5 most recent data links
  const recentDataLinks = allProxiedPaths?.slice(0, 5) || [];

  return (
    <DashboardCard title="Recently created data links">
      {recentDataLinks.length === 0 ? (
        <div className="text-center py-8">
          <Typography variant="small" className="text-muted-foreground">
            No data links created yet
          </Typography>
        </div>
      ) : (
        <div className="space-y-2">
          {recentDataLinks.map(proxiedPath => (
            <ProxiedPathRow key={proxiedPath.sharing_key} item={proxiedPath} />
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
