import { useEffect, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams
} from 'react-router';

import { Card, Typography } from '@material-tailwind/react';
import { HiOutlineDownload, HiOutlinePlay } from 'react-icons/hi';
import toast from 'react-hot-toast';

import AppLaunchForm from '@/components/ui/AppsPage/AppLaunchForm';
import AppPageHeader from '@/components/ui/AppsPage/AppPageHeader';
import {
  buildAppDetailPath,
  buildGithubUrl,
  canonicalGithubUrl,
  getAppIconType
} from '@/utils';
import {
  useAppsQuery,
  useAddAppMutation,
  useManifestPreviewMutation
} from '@/queries/appsQueries';
import { useSubmitJobMutation } from '@/queries/jobsQueries';
import type { AppEntryPoint, AppResourceDefaults } from '@/shared.types';
import FgButton from './designSystem/atoms/FgButton';

export default function AppLaunch() {
  const {
    owner,
    repo,
    branch: routeBranch,
    entryPointId: routeEntryPointId
  } = useParams<{
    owner: string;
    repo: string;
    branch?: string;
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
  const branch = searchParams.get('branch') || routeBranch || 'main';
  const entryPointId = searchParams.get('entryPointId') || routeEntryPointId;
  const appUrl = buildGithubUrl(owner!, repo!, branch);
  const isRelaunch = location.pathname.startsWith('/apps/relaunch/');
  const relaunchState = isRelaunch
    ? (location.state as {
        parameters?: Record<string, unknown>;
        env_parameters?: Record<string, unknown>;
        resources?: Record<string, unknown>;
        env?: Record<string, string>;
        pre_run?: string;
        post_run?: string;
        container?: string;
        container_args?: string;
      } | null)
    : null;
  const relaunchParameters = relaunchState?.parameters;
  const relaunchEnvParameters = relaunchState?.env_parameters;
  const relaunchResources = relaunchState?.resources as
    | AppResourceDefaults
    | undefined;
  // extra_args stored in resources dict from previous job
  const relaunchExtraArgs = relaunchState?.resources?.extra_args as
    | string
    | undefined;
  const relaunchEnv = relaunchState?.env;
  const relaunchPreRun = relaunchState?.pre_run;
  const relaunchPostRun = relaunchState?.post_run;
  const relaunchContainer = relaunchState?.container;
  const relaunchContainerArgs = relaunchState?.container_args;

  // Check if app is in user's library. Match by canonical URL identity rather
  // than exact string: stored app URLs may carry cosmetic variations (a ".git"
  // suffix, trailing slash, or "/tree/main") that don't survive the round-trip
  // through the route, which would otherwise make an installed app — e.g. one
  // added from the catalog — wrongly appear "not in your library".
  const installedApp = appsQuery.data?.find(
    a =>
      canonicalGithubUrl(a.url) === appUrl && a.manifest_path === manifestPath
  );
  const isInstalled = installedApp !== undefined;

  useEffect(() => {
    if (appUrl) {
      // The manifest identity is (url, manifest_path); reset the selection so
      // a stale entry point from the previous app isn't carried over.
      setSelectedEntryPoint(null);
      manifestMutation.mutate({ url: appUrl, manifest_path: manifestPath });
    }
    // Re-fetch when the app identity (url or manifest path) changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appUrl, manifestPath]);

  const manifest = manifestMutation.data;

  // Prefer the user's saved app name (which may be a custom name chosen when
  // adding the app from the catalog) over the raw manifest name.
  const displayName = installedApp?.name ?? manifest?.name;

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

  const handleSubmit = (
    parameters: Record<string, unknown>,
    envParameters: Record<string, unknown>,
    resources?: AppResourceDefaults,
    extraArgs?: string,
    env?: Record<string, string>,
    preRun?: string,
    postRun?: string,
    container?: string,
    containerArgs?: string
  ) => {
    if (!selectedEntryPoint) {
      return;
    }
    submitJobMutation.reset();
    submitJobMutation.mutate(
      {
        app_url: appUrl,
        manifest_path: manifestPath,
        entry_point_id: selectedEntryPoint.id,
        parameters,
        env_parameters: envParameters,
        resources,
        extra_args: extraArgs,
        env,
        pre_run: preRun,
        post_run: postRun,
        container,
        container_args: containerArgs
      },
      {
        onSuccess: job => {
          toast.success('Job submitted');
          navigate(`/apps/jobs/${job.id}`);
        }
      }
    );
  };

  const handleInstall = async () => {
    try {
      const apps = await addAppMutation.mutateAsync({ url: appUrl });
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
      <AppPageHeader
        backLabel={installedApp ? 'Back to app details' : 'Back to My Apps'}
        backTo={
          installedApp
            ? buildAppDetailPath(installedApp.url, installedApp.manifest_path)
            : '/apps'
        }
        icon={manifest ? getAppIconType(manifest) : undefined}
        title={displayName}
      />

      {/* Not-installed banner */}
      {!appsQuery.isPending && !isInstalled ? (
        <div className="mb-4 p-3 flex items-center gap-3 border border-primary-light rounded-lg bg-surface/30">
          <Typography className="text-foreground flex-1" type="small">
            This app is not in your library. Install it for quick access from
            the Apps page.
          </Typography>
          <FgButton
            className="flex-shrink-0"
            disabled={addAppMutation.isPending}
            icon={HiOutlineDownload}
            loading={addAppMutation.isPending}
            loadingText="Installing"
            onClick={handleInstall}
            size="sm"
          >
            Install App
          </FgButton>
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
        <AppLaunchForm
          appName={displayName}
          entryPoint={selectedEntryPoint}
          initialContainer={relaunchContainer}
          initialContainerArgs={relaunchContainerArgs}
          initialEnv={relaunchEnv}
          initialEnvParameters={relaunchEnvParameters}
          initialExtraArgs={relaunchExtraArgs}
          initialPostRun={relaunchPostRun}
          initialPreRun={relaunchPreRun}
          initialResources={relaunchResources}
          initialValues={relaunchParameters}
          manifest={manifest}
          onSubmit={handleSubmit}
          submitError={submitJobMutation.error?.message}
          submitting={submitJobMutation.isPending}
        />
      ) : manifest ? (
        <div className="max-w-2xl">
          {manifest.description ? (
            <Typography className="mb-6">{manifest.description}</Typography>
          ) : null}
          <Typography className="mb-3">Select an entry point:</Typography>
          <div className="space-y-4">
            {manifest.runnables.map(ep => (
              <Card
                className="p-4 flex flex-col gap-2 text-left w-full"
                key={ep.id}
              >
                <div className="flex items-center gap-2">
                  <Typography className="text-foreground font-semibold">
                    {ep.name}
                  </Typography>
                  {ep.type === 'service' ? (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-info/10 text-info border border-info/30">
                      Service
                    </span>
                  ) : null}
                </div>
                {ep.description ? (
                  <Typography className="text-sm md:text-base text-foreground">
                    {ep.description}
                  </Typography>
                ) : null}
                <FgButton
                  className="!rounded-md flex-shrink-0 self-start"
                  icon={HiOutlinePlay}
                  onClick={() => setSelectedEntryPoint(ep)}
                  size="sm"
                >
                  Select
                </FgButton>
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
