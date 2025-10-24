import { Typography } from '@material-tailwind/react';

import DashboardCard from '@/components/ui/BrowsePage/Dashboard/FgDashboardCard';
import Folder from '@/components/ui/Sidebar/Folder';
import FileSharePathComponent from '@/components/ui/Sidebar/FileSharePath';
import { SidebarItemSkeleton } from '@/components/ui/widgets/Loaders';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { makeMapKey } from '@/utils';
import type { FileSharePath } from '@/shared.types';

export default function RecentlyViewedCard() {
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const { recentlyViewedFolders, preferenceQuery } = usePreferencesContext();

  return (
    <DashboardCard title="Recently viewed">
      {preferenceQuery.isPending || zonesAndFspQuery.isPending ? (
        Array(5)
          .fill(0)
          .map((_, index) => (
            <SidebarItemSkeleton key={index} withEndIcon={false} />
          ))
      ) : zonesAndFspQuery.isError ? (
        <div className="px-4 pt-4 flex flex-col gap-4">
          <Typography className="text-error">
            Error loading zones and file share paths:{' '}
            {zonesAndFspQuery.error.message}
          </Typography>
        </div>
      ) : (
        <ul>
          {recentlyViewedFolders.map((item, index) => {
            const fspKey = makeMapKey('fsp', item.fspName);
            const fsp = zonesAndFspQuery.data[fspKey] as FileSharePath;

            // If path is ".", it's a file share path
            if (item.folderPath === '.') {
              return (
                <FileSharePathComponent
                  fsp={fsp}
                  isFavoritable={false}
                  key={`${item.fspName}-${index}`}
                />
              );
            } else {
              // Otherwise, it's a folder
              return (
                <Folder
                  folderPath={item.folderPath}
                  fsp={fsp}
                  isFavoritable={false}
                  key={`${item.fspName}-${item.folderPath}-${index}`}
                />
              );
            }
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
