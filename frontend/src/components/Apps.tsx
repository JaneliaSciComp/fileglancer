import { useMemo, useState } from 'react';

import { Button, Typography } from '@material-tailwind/react';
import { HiOutlinePlus } from 'react-icons/hi';
import toast from 'react-hot-toast';

import AppCard from '@/components/ui/AppsPage/AppCard';
import AddAppDialog from '@/components/ui/AppsPage/AddAppDialog';
import { TableCard } from '@/components/ui/Table/TableCard';
import { createAppsJobsColumns } from '@/components/ui/Table/appsJobsColumns';
import {
  useAppsQuery,
  useAddAppMutation,
  useRemoveAppMutation
} from '@/queries/appsQueries';
import { useJobsQuery, useCancelJobMutation } from '@/queries/jobsQueries';

export default function Apps() {
  const [showAddDialog, setShowAddDialog] = useState(false);

  const appsQuery = useAppsQuery();
  const jobsQuery = useJobsQuery();
  const addAppMutation = useAddAppMutation();
  const removeAppMutation = useRemoveAppMutation();
  const cancelJobMutation = useCancelJobMutation();

  const handleAddApp = async (url: string) => {
    try {
      await addAppMutation.mutateAsync(url);
      toast.success('App added');
      setShowAddDialog(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to add app';
      toast.error(message);
    }
  };

  const handleRemoveApp = async (url: string) => {
    try {
      await removeAppMutation.mutateAsync(url);
      toast.success('App removed');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to remove app';
      toast.error(message);
    }
  };

  const handleCancelJob = async (jobId: number) => {
    try {
      await cancelJobMutation.mutateAsync(jobId);
      toast.success('Job cancelled');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to cancel job';
      toast.error(message);
    }
  };

  const jobsColumns = useMemo(
    () => createAppsJobsColumns(handleCancelJob),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div>
      {/* My Apps Section */}
      <Typography className="mb-4 text-foreground font-bold" type="h5">
        Apps
      </Typography>
      <Typography className="mb-4 text-foreground" type="small">
        Run command-line tools on the cluster. Add apps by URL to get started.
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
              key={app.url}
              onRemove={handleRemoveApp}
              removing={removeAppMutation.isPending}
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

      {/* Recent Jobs Section */}
      <Typography className="mb-4 text-foreground font-bold" type="h5">
        Recent Jobs
      </Typography>

      <TableCard
        columns={jobsColumns}
        data={jobsQuery.data || []}
        dataType="jobs"
        errorState={jobsQuery.error}
        gridColsClass="grid-cols-[2fr_2fr_1fr_2fr_1fr_1fr]"
        loadingState={jobsQuery.isPending}
      />

      <AddAppDialog
        adding={addAppMutation.isPending}
        onAdd={handleAddApp}
        onClose={() => setShowAddDialog(false)}
        open={showAddDialog}
      />
    </div>
  );
}
