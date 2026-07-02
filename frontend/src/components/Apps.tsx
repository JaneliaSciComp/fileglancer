import { useState } from 'react';

import { Typography } from '@material-tailwind/react';
import { HiOutlineLink } from 'react-icons/hi2';
import toast from 'react-hot-toast';

import AppCard from '@/components/ui/AppsPage/AppCard';
import AddAppDialog from '@/components/ui/AppsPage/AddAppDialog';
import AppActionDialogs from '@/components/ui/AppsPage/AppActionDialogs';
import {
  useAppsQuery,
  useAddAppMutation,
  useDiscoverAppsMutation
} from '@/queries/appsQueries';
import { useAppActions } from '@/hooks/useAppActions';
import FgButton from './designSystem/atoms/FgButton';
import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';
import { DOCS_BASE_URL } from '@/constants/docs';

export default function Apps() {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const appsQuery = useAppsQuery();
  const addAppMutation = useAddAppMutation();
  const discoverAppsMutation = useDiscoverAppsMutation();
  const actions = useAppActions();

  const handleDiscover = (url: string) => discoverAppsMutation.mutateAsync(url);

  const handleAddFromUrl = async (url: string, manifestPaths?: string[]) => {
    const apps = await addAppMutation.mutateAsync({
      url,
      manifest_paths: manifestPaths
    });
    const count = apps.length;
    toast.success(`${count} app${count !== 1 ? 's' : ''} added`);
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

      <div className="mb-6">
        <FgButton
          icon={HiOutlineLink}
          onClick={() => setShowAddDialog(true)}
          variant="outline"
        >
          Add from URL
        </FgButton>
      </div>

      {appsQuery.isPending ? (
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
