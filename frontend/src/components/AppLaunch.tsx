import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

import { Button, Typography } from '@material-tailwind/react';
import { HiOutlineArrowLeft, HiOutlinePlay } from 'react-icons/hi';
import toast from 'react-hot-toast';

import AppLaunchForm from '@/components/ui/AppsPage/AppLaunchForm';
import { useManifestPreviewMutation } from '@/queries/appsQueries';
import { useSubmitJobMutation } from '@/queries/jobsQueries';
import type { AppEntryPoint, AppResourceDefaults } from '@/shared.types';

type LaunchState = {
  appUrl?: string;
  manifestPath?: string;
  entryPointId?: string;
  parameters?: Record<string, unknown>;
} | null;

export default function AppLaunch() {
  const { encodedUrl } = useParams<{ encodedUrl: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const manifestMutation = useManifestPreviewMutation();
  const submitJobMutation = useSubmitJobMutation();
  const [selectedEntryPoint, setSelectedEntryPoint] =
    useState<AppEntryPoint | null>(null);

  const launchState = (location.state as LaunchState) || null;
  // Prefer app URL from state (relaunch), fall back to path param (normal launch)
  const appUrl = launchState?.appUrl
    ? launchState.appUrl
    : encodedUrl
      ? decodeURIComponent(encodedUrl)
      : '';
  const manifestPath = launchState?.manifestPath ?? '';

  useEffect(() => {
    if (appUrl) {
      manifestMutation.mutate({ url: appUrl, manifest_path: manifestPath });
    }
    // Only fetch on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUrl]);

  const manifest = manifestMutation.data;

  // Auto-select entry point from relaunch state, or if there's only one
  useEffect(() => {
    if (!manifest) {
      return;
    }
    if (launchState?.entryPointId) {
      const ep = manifest.entryPoints.find(
        e => e.id === launchState.entryPointId
      );
      if (ep) {
        setSelectedEntryPoint(ep);
        return;
      }
    }
    if (manifest.entryPoints.length === 1) {
      setSelectedEntryPoint(manifest.entryPoints[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest]);

  const handleSubmit = async (
    parameters: Record<string, unknown>,
    resources?: AppResourceDefaults,
    pullLatest?: boolean
  ) => {
    if (!selectedEntryPoint) {
      return;
    }
    try {
      await submitJobMutation.mutateAsync({
        app_url: appUrl,
        manifest_path: manifestPath,
        entry_point_id: selectedEntryPoint.id,
        parameters,
        resources,
        pull_latest: pullLatest
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
            initialValues={launchState?.parameters}
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
