import { useMemo, useState } from 'react';

import { Typography } from '@material-tailwind/react';
import { HiOutlineLink } from 'react-icons/hi2';
import toast from 'react-hot-toast';

import AppCard from '@/components/ui/AppsPage/AppCard';
import AddAppDialog from '@/components/ui/AppsPage/AddAppDialog';
import AppActionDialogs from '@/components/ui/AppsPage/AppActionDialogs';
import { TableCard } from '@/components/ui/Table/TableCard';
import { createMyAppsColumns } from '@/components/ui/Table/myAppsColumns';
import ViewModeToggle from '@/components/ui/widgets/ViewModeToggle';
import {
  useAppsQuery,
  useAddAppMutation,
  useDiscoverAppsMutation
} from '@/queries/appsQueries';
import { useAppActions } from '@/hooks/useAppActions';
import { useViewMode } from '@/hooks/useViewMode';
import FgButton from './designSystem/atoms/FgButton';
import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';
import { DOCS_BASE_URL } from '@/constants/docs';

export default function Apps() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [viewMode, changeViewMode] = useViewMode('appsViewMode');

  const appsQuery = useAppsQuery();
  const addAppMutation = useAddAppMutation();
  const discoverAppsMutation = useDiscoverAppsMutation();
  const actions = useAppActions();

  const appsColumns = useMemo(
    () => createMyAppsColumns(actions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleDiscover = (url: string) => discoverAppsMutation.mutateAsync(url);

  const handleAddFromUrl = async (url: string, manifestPaths?: string[]) => {
    const apps = await addAppMutation.mutateAsync({
      url,
      manifest_paths: manifestPaths
    });
    const count = apps.length;
    // Guard against a misleading "0 apps added" success (nothing new to add).
    if (count > 0) {
      toast.success(`${count} app${count !== 1 ? 's' : ''} added`);
    }
    setShowAddDialog(false);
  };

  return (
    <div>
      <Typography className="mb-6 text-foreground">
        Run command-line tools on the compute cluster. Browse the App Catalog to
        find shared apps, or add one from a GitHub URL. If you want to create
        your own app, see the{' '}
        <FgExternalLink href={`${DOCS_BASE_URL}/authoring/overview/`}>
          authoring guide
        </FgExternalLink>
        .
      </Typography>

      <div className="mb-6 flex items-center justify-between gap-2">
        <FgButton
          icon={HiOutlineLink}
          onClick={() => setShowAddDialog(true)}
          variant="outline"
        >
          Add from URL
        </FgButton>
        <ViewModeToggle onChange={changeViewMode} viewMode={viewMode} />
      </div>

      {viewMode === 'table' ? (
        <div className="mb-8">
          <TableCard
            columns={appsColumns}
            data={appsQuery.data || []}
            dataType="apps"
            errorState={appsQuery.error}
            gridColsClass="grid-cols-[3fr_8rem_4fr_1fr_1fr]"
            initialPageSize={50}
            loadingState={appsQuery.isPending}
          />
        </div>
      ) : appsQuery.isPending ? (
        <Typography className="text-foreground mb-6" type="small">
          Loading apps...
        </Typography>
      ) : appsQuery.isError ? (
        <div className="mb-6 p-3 bg-error/10 rounded text-error text-sm">
          Failed to load apps: {appsQuery.error?.message || 'Unknown error'}
        </div>
      ) : appsQuery.data?.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {appsQuery.data.map(app => (
            <AppCard
              actions={actions}
              app={app}
              key={`${app.url}::${app.manifest_path}`}
            />
          ))}
        </div>
      ) : (
        <div className="mb-8 p-6 border border-dashed border-primary-light rounded-lg text-center">
          <Typography className="text-foreground" type="small">
            No apps configured. Browse the catalog or add one from a GitHub URL
            to get started.
          </Typography>
        </div>
      )}

      <AddAppDialog
        adding={addAppMutation.isPending}
        discovering={discoverAppsMutation.isPending}
        onAdd={handleAddFromUrl}
        onClose={() => setShowAddDialog(false)}
        onDiscover={handleDiscover}
        open={showAddDialog}
      />
      <AppActionDialogs actions={actions} />
    </div>
  );
}
