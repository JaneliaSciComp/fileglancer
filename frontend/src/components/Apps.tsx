import { useState } from 'react';

import { Button, Typography } from '@material-tailwind/react';
import { HiOutlinePlus } from 'react-icons/hi';
import toast from 'react-hot-toast';

import AppCard from '@/components/ui/AppsPage/AppCard';
import AddAppDialog from '@/components/ui/AppsPage/AddAppDialog';
import {
  useAppsQuery,
  useAddAppMutation,
  useUpdateAppMutation,
  useRemoveAppMutation
} from '@/queries/appsQueries';

export default function Apps() {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const appsQuery = useAppsQuery();
  const addAppMutation = useAddAppMutation();
  const updateAppMutation = useUpdateAppMutation();
  const removeAppMutation = useRemoveAppMutation();

  const handleAddApp = async (url: string) => {
    const apps = await addAppMutation.mutateAsync(url);
    const count = apps.length;
    toast.success(`${count} app${count !== 1 ? 's' : ''} added`);
    setShowAddDialog(false);
  };

  const handleRemoveApp = async ({
    url,
    manifest_path
  }: {
    url: string;
    manifest_path: string;
  }) => {
    try {
      await removeAppMutation.mutateAsync({ url, manifest_path });
      toast.success('App removed');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to remove app';
      toast.error(message);
    }
  };

  const handleUpdateApp = async ({
    url,
    manifest_path
  }: {
    url: string;
    manifest_path: string;
  }) => {
    try {
      await updateAppMutation.mutateAsync({ url, manifest_path });
      toast.success('App updated');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update app';
      toast.error(message);
    }
  };

  return (
    <div>
      <Typography className="mb-4 text-foreground font-bold" type="h5">
        Apps
      </Typography>
      <Typography className="mb-4 text-foreground" type="small">
        Run command-line tools on the compute cluster. Add apps by URL to get started.
      </Typography>

      <div className="mb-6">
        <Button className="!rounded-md" onClick={() => setShowAddDialog(true)}>
          <HiOutlinePlus className="icon-default mr-2" />
          Add App
        </Button>
      </div>

      {appsQuery.isPending ? (
        <Typography className="text-secondary mb-6" type="small">
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
              app={app}
              key={`${app.url}::${app.manifest_path}`}
              onRemove={handleRemoveApp}
              onUpdate={handleUpdateApp}
              removing={removeAppMutation.isPending}
              updating={updateAppMutation.isPending}
            />
          ))}
        </div>
      ) : (
        <div className="mb-8 p-6 border border-dashed border-primary-light rounded-lg text-center">
          <Typography className="text-secondary" type="small">
            No apps configured. Click &quot;Add App&quot; to get started.
          </Typography>
        </div>
      )}

      <AddAppDialog
        adding={addAppMutation.isPending}
        onAdd={handleAddApp}
        onClose={() => setShowAddDialog(false)}
        open={showAddDialog}
      />
    </div>
  );
}
