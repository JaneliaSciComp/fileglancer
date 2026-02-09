import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { Button, Typography } from '@material-tailwind/react';
import { HiOutlineArrowLeft, HiOutlinePlay } from 'react-icons/hi';
import toast from 'react-hot-toast';

import AppLaunchForm from '@/components/ui/AppsPage/AppLaunchForm';
import { useManifestPreviewMutation } from '@/queries/appsQueries';
import { useSubmitJobMutation } from '@/queries/jobsQueries';
import type { AppEntryPoint, AppResourceDefaults } from '@/shared.types';

export default function AppLaunch() {
  const { encodedUrl } = useParams<{ encodedUrl: string }>();
  const navigate = useNavigate();
  const manifestMutation = useManifestPreviewMutation();
  const submitJobMutation = useSubmitJobMutation();
  const [selectedEntryPoint, setSelectedEntryPoint] =
    useState<AppEntryPoint | null>(null);

  const appUrl = encodedUrl ? decodeURIComponent(encodedUrl) : '';

  useEffect(() => {
    if (appUrl) {
      manifestMutation.mutate(appUrl);
    }
    // Only fetch on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUrl]);

  const manifest = manifestMutation.data;

  // Auto-select if there's only one entry point
  useEffect(() => {
    if (manifest?.entryPoints.length === 1) {
      setSelectedEntryPoint(manifest.entryPoints[0]);
    }
  }, [manifest]);

  const handleSubmit = async (
    parameters: Record<string, unknown>,
    resources?: AppResourceDefaults
  ) => {
    if (!selectedEntryPoint) {
      return;
    }
    try {
      await submitJobMutation.mutateAsync({
        app_url: appUrl,
        entry_point_id: selectedEntryPoint.id,
        parameters,
        resources
      });
      toast.success('Job submitted');
      navigate('/apps');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to submit job';
      toast.error(message);
    }
  };

  return (
    <div>
      <Button
        className="!rounded-md mb-6"
        onClick={() => navigate('/apps')}
        variant="outline"
      >
        <HiOutlineArrowLeft className="icon-small mr-2" />
        Back to Apps
      </Button>

      {manifestMutation.isPending ? (
        <Typography className="text-secondary" type="small">
          Loading app manifest...
        </Typography>
      ) : manifestMutation.isError ? (
        <div className="p-3 bg-error/10 rounded text-error text-sm">
          Failed to load app manifest:{' '}
          {manifestMutation.error?.message || 'Unknown error'}
        </div>
      ) : manifest && selectedEntryPoint ? (
        <>
          {manifest.entryPoints.length > 1 ? (
            <Button
              className="!rounded-md mb-4"
              onClick={() => setSelectedEntryPoint(null)}
              variant="outline"
            >
              <HiOutlineArrowLeft className="icon-small mr-2" />
              Choose a different entry point
            </Button>
          ) : null}
          <AppLaunchForm
            entryPoint={selectedEntryPoint}
            manifest={manifest}
            onSubmit={handleSubmit}
            submitting={submitJobMutation.isPending}
          />
        </>
      ) : manifest ? (
        <div className="max-w-2xl">
          <Typography className="text-foreground font-bold mb-1" type="h5">
            {manifest.name}
          </Typography>
          {manifest.description ? (
            <Typography className="text-secondary mb-4" type="small">
              {manifest.description}
            </Typography>
          ) : null}
          <Typography className="text-foreground font-medium mb-3" type="p">
            Select an entry point:
          </Typography>
          <div className="space-y-2">
            {manifest.entryPoints.map(ep => (
              <div
                className="flex items-center justify-between gap-4 p-3 border border-primary-light rounded-lg bg-background hover:bg-surface/30 transition-colors"
                key={ep.id}
              >
                <div className="flex-1 min-w-0">
                  <Typography
                    className="text-foreground font-medium"
                    type="small"
                  >
                    {ep.name}
                  </Typography>
                  {ep.description ? (
                    <Typography className="text-secondary mt-1" type="small">
                      {ep.description}
                    </Typography>
                  ) : null}
                </div>
                <Button
                  className="!rounded-md flex-shrink-0"
                  onClick={() => setSelectedEntryPoint(ep)}
                  size="sm"
                >
                  <HiOutlinePlay className="icon-small mr-1" />
                  Select
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
