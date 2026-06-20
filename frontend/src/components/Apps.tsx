import { useState } from 'react';

import { Typography } from '@material-tailwind/react';
import { HiOutlineLink } from 'react-icons/hi2';
import toast from 'react-hot-toast';

import AppCard from '@/components/ui/AppsPage/AppCard';
import AddAppDialog from '@/components/ui/AppsPage/AddAppDialog';
import DeleteAppDialog from '@/components/ui/AppsPage/DeleteAppDialog';
import {
  useAppsQuery,
  useAddAppMutation,
  useUpdateAppMutation,
  useRemoveAppMutation,
  useShareAppMutation,
  useUnshareListingMutation
} from '@/queries/appsQueries';
import FgButton from './designSystem/atoms/FgButton';
import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';
import { DOCS_BASE_URL } from '@/constants/docs';
import type { UserApp } from '@/shared.types';

export default function Apps() {
  const [deleteApp, setDeleteApp] = useState<UserApp | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const appsQuery = useAppsQuery();
  const addAppMutation = useAddAppMutation();
  const updateAppMutation = useUpdateAppMutation();
  const removeAppMutation = useRemoveAppMutation();
  const shareAppMutation = useShareAppMutation();
  const unshareListingMutation = useUnshareListingMutation();

  const handleRequestRemove = (app: UserApp) => {
    setDeleteApp(app);
  };

  const handleConfirmDelete = async () => {
    if (!deleteApp) {
      return;
    }
    try {
      await removeAppMutation.mutateAsync({
        url: deleteApp.url,
        manifest_path: deleteApp.manifest_path
      });
      toast.success('App removed');
      setDeleteApp(null);
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

  const handleShare = async (params: {
    url: string;
    manifest_path: string;
    name: string;
    description: string;
  }) => {
    await shareAppMutation.mutateAsync({
      url: params.url,
      manifest_path: params.manifest_path,
      name: params.name,
      description: params.description
    });
    toast.success('Shared to catalog');
  };

  const handleAddFromUrl = async (url: string) => {
    const apps = await addAppMutation.mutateAsync(url);
    const count = apps.length;
    toast.success(`${count} app${count !== 1 ? 's' : ''} added`);
    setShowAddDialog(false);
  };

  const handleUnshare = async (listingId: number) => {
    try {
      await unshareListingMutation.mutateAsync({ listing_id: listingId });
      toast.success('Removed from catalog');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to unshare';
      toast.error(message);
    }
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
              app={app}
              key={`${app.url}::${app.manifest_path}`}
              onRemove={() => handleRequestRemove(app)}
              onShare={handleShare}
              onUnshare={() =>
                app.listing_id !== undefined
                  ? handleUnshare(app.listing_id)
                  : undefined
              }
              onUpdate={handleUpdateApp}
              removing={removeAppMutation.isPending}
              sharing={shareAppMutation.isPending}
              unsharing={unshareListingMutation.isPending}
              updating={updateAppMutation.isPending}
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
        onAdd={handleAddFromUrl}
        onClose={() => setShowAddDialog(false)}
        open={showAddDialog}
      />
      <DeleteAppDialog
        app={deleteApp}
        onClose={() => setDeleteApp(null)}
        onConfirm={handleConfirmDelete}
        open={deleteApp !== null}
        removing={removeAppMutation.isPending}
      />
    </div>
  );
}
