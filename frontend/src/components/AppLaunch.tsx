import { useEffect, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams
} from 'react-router';

import { Button, Typography } from '@material-tailwind/react';
import {
  HiOutlineArrowLeft,
  HiOutlineDownload,
  HiOutlinePlay
} from 'react-icons/hi';
import toast from 'react-hot-toast';

import AppLaunchForm from '@/components/ui/AppsPage/AppLaunchForm';
import { buildGithubUrl } from '@/utils';
import {
  useAppsQuery,
  useAddAppMutation,
  useManifestPreviewMutation
} from '@/queries/appsQueries';
import { useSubmitJobMutation } from '@/queries/jobsQueries';
import type { AppEntryPoint, AppResourceDefaults } from '@/shared.types';

export default function AppLaunch() {
  const { owner, repo, branch, entryPointId } = useParams<{
    owner: string;
    repo: string;
    branch: string;
    entryPointId?: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const manifestMutation = useManifestPreviewMutation();
  const submitJobMutation = useSubmitJobMutation();
  const appsQuery = useAppsQuery();
  const addAppMutation = useAddAppMutation();
  const [selectedEntryPoint, setSelectedEntryPoint] =
    useState<AppEntryPoint | null>(null);

  const manifestPath = searchParams.get('path') || '';
  const appUrl = buildGithubUrl(owner!, repo!, branch!);
  const isRelaunch = location.pathname.startsWith('/apps/relaunch/');
  const relaunchState = isRelaunch
    ? (location.state as {
        parameters?: Record<string, unknown>;
        resources?: Record<string, unknown>;
        env?: Record<string, string>;
        pre_run?: string;
        post_run?: string;
        pull_latest?: boolean;
      } | null)
    : null;
  const relaunchParameters = relaunchState?.parameters;
  const relaunchResources = relaunchState?.resources as
    | AppResourceDefaults
    | undefined;
  const relaunchEnv = relaunchState?.env;
  const relaunchPreRun = relaunchState?.pre_run;
  const relaunchPostRun = relaunchState?.post_run;
  const relaunchPullLatest = relaunchState?.pull_latest;

  // Check if app is in user's library
  const isInstalled = appsQuery.data?.some(
    a => a.url === appUrl && a.manifest_path === manifestPath
  );

  useEffect(() => {
    if (appUrl) {
      manifestMutation.mutate({ url: appUrl, manifest_path: manifestPath });
    }
    // Only fetch on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUrl]);

  const manifest = manifestMutation.data;

  // Auto-select entry point from URL param, or if there's only one
  useEffect(() => {
    if (!manifest) {
      return;
    }
    if (entryPointId) {
      const ep = manifest.runnables.find(e => e.id === entryPointId);
      if (ep) {
        setSelectedEntryPoint(ep);
        return;
      }
    }
    if (manifest.runnables.length === 1) {
      setSelectedEntryPoint(manifest.runnables[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest]);

  const handleSubmit = async (
    parameters: Record<string, unknown>,
    resources?: AppResourceDefaults,
    pullLatest?: boolean,
    env?: Record<string, string>,
    preRun?: string,
    postRun?: string
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
        pull_latest: pullLatest,
        env,
        pre_run: preRun,
        post_run: postRun
      });
      toast.success('Job submitted');
      navigate('/apps/jobs');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to submit job';
      toast.error(message);
    }
  };

  const handleInstall = async () => {
    try {
      const apps = await addAppMutation.mutateAsync(appUrl);
      const count = apps.length;
      toast.success(`${count} app${count !== 1 ? 's' : ''} added`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to install app';
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

      {/* Not-installed banner */}
      {!appsQuery.isPending && !isInstalled ? (
        <div className="mb-4 p-3 flex items-center gap-3 border border-primary-light rounded-lg bg-surface/30">
          <Typography className="text-secondary flex-1" type="small">
            This app is not in your library. Install it for quick access from
            the Apps page.
          </Typography>
          <Button
            className="!rounded-md flex-shrink-0"
            disabled={addAppMutation.isPending}
            onClick={handleInstall}
            size="sm"
          >
            <HiOutlineDownload className="icon-small mr-1" />
            {addAppMutation.isPending ? 'Installing...' : 'Install App'}
          </Button>
        </div>
      ) : null}

      {manifestMutation.isPending ? (
        <div className="animate-pulse">
          {/* Title + subtitle */}
          <div className="mb-4">
            <div className="w-48 h-6 bg-surface rounded mb-2" />
            <div className="w-32 h-4 bg-surface rounded" />
          </div>
          {/* Tab bar skeleton */}
          <div className="flex gap-4 py-2 mb-4 w-full bg-surface/50 rounded px-2">
            <div className="w-28 h-4 bg-surface rounded" />
            <div className="w-24 h-4 bg-surface rounded" />
          </div>
          {/* Parameter fields */}
          <div className="max-w-2xl space-y-4 mb-6">
            {[1, 2, 3].map(i => (
              <div key={i}>
                <div className="w-24 h-4 bg-surface rounded mb-2" />
                <div className="w-full h-10 bg-surface rounded" />
              </div>
            ))}
          </div>
          {/* Submit button */}
          <div className="w-32 h-10 bg-surface rounded" />
        </div>
      ) : manifestMutation.isError ? (
        <div className="p-3 bg-error/10 rounded text-error text-sm">
          Failed to load app manifest:{' '}
          {manifestMutation.error?.message || 'Unknown error'}
        </div>
      ) : manifest && selectedEntryPoint ? (
        <>
          {manifest.runnables.length > 1 ? (
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
            initialEnv={relaunchEnv}
            initialPostRun={relaunchPostRun}
            initialPreRun={relaunchPreRun}
            initialPullLatest={relaunchPullLatest}
            initialResources={relaunchResources}
            initialValues={relaunchParameters}
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
            {manifest.runnables.map(ep => (
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
