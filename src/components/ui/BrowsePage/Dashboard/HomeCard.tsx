import { HiOutlineHome } from 'react-icons/hi2';

import DashboardCard from '@/components/ui/BrowsePage/Dashboard/FgDashboardCard';
import Folder from '@/components/ui/Sidebar/Folder';
import type { FileSharePath } from '@/shared.types';

const sampleHomeFolderData = {
  group: 'scicompsoft',
  is_dir: true,
  last_modified: 1753286059.7287467,
  name: 'truhlara',
  owner: 'truhlara',
  path: 'truhlara',
  permissions: 'drwxr-xr-x',
  size: 0
};

const sampleHomeFileSharePath: FileSharePath = {
  group: 'scicompsoft',
  linux_path: '/groups/scicompsoft/home',
  mac_path: 'smb://prfs.hhmi.org/scicompsoft$',
  mount_path: '/groups/scicompsoft/home',
  name: 'groups_scicompsoft_home',
  storage: 'home',
  windows_path: '\\\\prfs.hhmi.org\\scicompsoft$',
  zone: 'Scientific Computing Software'
};

export default function HomeCard() {
  return (
    <DashboardCard title="Navigate to home folder">
      <Folder
        fsp={sampleHomeFileSharePath}
        folderPath={sampleHomeFolderData.path}
        isFavoritable={false}
        icon={
          <HiOutlineHome className="icon-small short:icon-xsmall stroke-2" />
        }
      />
    </DashboardCard>
  );
}
