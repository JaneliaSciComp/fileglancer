import DashboardCard from '@/components/ui/BrowsePage/Dashboard/FgDashboardCard';
import Folder from '@/components/ui/Sidebar/Folder';
import FileSharePathComponent from '@/components/ui/Sidebar/FileSharePath';
import type { FileSharePath } from '@/shared.types';
import type { FolderFavorite } from '@/contexts/PreferencesContext';

type RecentlyViewedItem = {
  name: string;
  path: string;
  fspName: string;
  lastViewed: string;
};

// Sample file share paths
// These would be accessed via a map key made from the recently
// viewed item data and the zones and FSP map
const exampleFileSharePaths: Record<string, FileSharePath> = {
  groups_scicompsoft_shared: {
    group: 'scicompsoft',
    linux_path: '/groups/scicompsoft/shared',
    mac_path: 'smb://prfs.hhmi.org/scicompsoft-shared$',
    mount_path: '/groups/scicompsoft/shared',
    name: 'groups_scicompsoft_shared',
    storage: 'shared',
    windows_path: '\\\\prfs.hhmi.org\\scicompsoft-shared$',
    zone: 'Scientific Computing Software'
  },
  groups_scicompsoft_home: {
    group: 'scicompsoft',
    linux_path: '/groups/scicompsoft/home',
    mac_path: 'smb://prfs.hhmi.org/scicompsoft$',
    mount_path: '/groups/scicompsoft/home',
    name: 'groups_scicompsoft_home',
    storage: 'home',
    windows_path: '\\\\prfs.hhmi.org\\scicompsoft$',
    zone: 'Scientific Computing Software'
  }
};

// Sample data for recently viewed items
// Directories only since you can't navigate to a file
const exampleRecentlyViewed: RecentlyViewedItem[] = [
  {
    name: 'shared',
    path: '.',
    fspName: 'groups_scicompsoft_shared',
    lastViewed: '2025-01-20'
  },
  {
    name: 'research_data',
    path: 'projects/research_data',
    fspName: 'groups_scicompsoft_shared',
    lastViewed: '2025-01-19'
  },
  {
    name: 'documents',
    path: 'personal/documents',
    fspName: 'groups_scicompsoft_home',
    lastViewed: '2025-01-18'
  },
  {
    name: 'home',
    path: '.',
    fspName: 'groups_scicompsoft_home',
    lastViewed: '2025-01-17'
  },
  {
    name: 'projects',
    path: 'projects',
    fspName: 'groups_scicompsoft_shared',
    lastViewed: '2025-01-16'
  },
  {
    name: 'analysis',
    path: 'work/analysis',
    fspName: 'groups_scicompsoft_home',
    lastViewed: '2025-01-15'
  },
  {
    name: 'datasets',
    path: 'data/datasets',
    fspName: 'groups_scicompsoft_shared',
    lastViewed: '2025-01-14'
  },
  {
    name: 'scripts',
    path: 'development/scripts',
    fspName: 'groups_scicompsoft_home',
    lastViewed: '2025-01-13'
  },
  {
    name: 'backup',
    path: 'system/backup',
    fspName: 'groups_scicompsoft_shared',
    lastViewed: '2025-01-12'
  },
  {
    name: 'configs',
    path: 'configs',
    fspName: 'groups_scicompsoft_shared',
    lastViewed: '2025-01-11'
  }
];

export default function RecentlyViewedCard() {
  const recentItems = exampleRecentlyViewed.slice(0, 8);

  return (
    <DashboardCard title="Recently viewed">
      <div className="space-y-1">
        {recentItems.map((item, index) => {
          // This would change to a map key to acess an fsp in the zones and fsp map
          const fsp = exampleFileSharePaths[item.fspName];

          // If path is ".", it's a file share path
          if (item.path === '.') {
            return (
              <FileSharePathComponent
                key={`${item.fspName}-${index}`}
                fsp={fsp}
                isFavoritable={false}
              />
            );
          } else {
            // Otherwise, it's a folder
            return (
              <Folder
                key={`${item.fspName}-${item.path}-${index}`}
                fsp={fsp}
                folderPath={item.path}
                isFavoritable={false}
              />
            );
          }
        })}
      </div>
    </DashboardCard>
  );
}
