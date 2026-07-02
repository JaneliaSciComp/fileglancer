import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Typography } from '@material-tailwind/react';
import { HiOutlinePlay, HiOutlineRefresh } from 'react-icons/hi';
import { HiOutlineEllipsisVertical } from 'react-icons/hi2';
import { FaUsers, FaUsersSlash } from 'react-icons/fa6';

import AppActionDialogs from '@/components/ui/AppsPage/AppActionDialogs';
import AppInfoTable from '@/components/ui/AppsPage/AppInfoTable';
import AppPageHeader from '@/components/ui/AppsPage/AppPageHeader';
import EntryPointsList from '@/components/ui/AppsPage/EntryPointsList';
import CardActionsMenu from '@/components/ui/Menus/CardActionsMenu';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgLink from '@/components/designSystem/atoms/FgLink';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import JobStatusBadge from '@/components/ui/AppsPage/JobStatusBadge';
import { useAppsQuery } from '@/queries/appsQueries';
import { useJobsQuery } from '@/queries/jobsQueries';
import { useAppActions } from '@/hooks/useAppActions';
import {
  buildGithubUrl,
  canonicalGithubUrl,
  formatDateString,
  getAppIconType
} from '@/utils';
import type { UserApp } from '@/shared.types';

const RECENT_JOBS_LIMIT = 5;

export default function AppDetail() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const appsQuery = useAppsQuery();
  const jobsQuery = useJobsQuery();
  const actions = useAppActions({ onRemoved: () => navigate('/apps') });

  const manifestPath = searchParams.get('path') || '';
  const branch = searchParams.get('branch') || 'main';
  const appUrl = buildGithubUrl(owner!, repo!, branch);

  // Match by canonical URL identity rather than exact string, since stored app
  // URLs may carry cosmetic variations (".git" suffix, trailing slash,
  // "/tree/main") that don't survive the round-trip through the route.
  const app = appsQuery.data?.find(
    a =>
      canonicalGithubUrl(a.url) === appUrl && a.manifest_path === manifestPath
  );

  if (appsQuery.isPending) {
    return (
      <Typography className="text-foreground" type="small">
        Loading app...
      </Typography>
    );
  }

  if (appsQuery.isError) {
    return (
      <div className="p-3 bg-error/10 rounded text-error text-sm">
        Failed to load apps: {appsQuery.error?.message || 'Unknown error'}
      </div>
    );
  }

  if (!app) {
    return (
      <div>
        <AppPageHeader title="App not found" />
        <Typography className="text-foreground mb-4">
          This app is not in your apps. It may have been removed.
        </Typography>
        <FgButton onClick={() => navigate('/apps')} variant="outline">
          Go to My Apps
        </FgButton>
      </div>
    );
  }

  const isShared = app.listing_id !== undefined && app.listing_id !== null;
  const runnables = app.manifest?.runnables ?? [];

  const appJobs = (jobsQuery.data ?? [])
    .filter(
      job =>
        canonicalGithubUrl(job.app_url) === appUrl &&
        (job.manifest_path || '') === manifestPath
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const recentJobs = appJobs.slice(0, RECENT_JOBS_LIMIT);

  const menuItems: MenuItem<UserApp>[] = [
    {
      name: 'Remove',
      action: a => actions.requestRemove(a),
      color: 'text-error'
    }
  ];

  return (
    <div>
      <AppPageHeader
        actions={
          <>
            {isShared ? (
              <FgTooltip label="Unshare from catalog">
                <FgButton
                  disabled={actions.unsharing}
                  icon={FaUsersSlash}
                  loading={actions.unsharing}
                  loadingText="Unsharing..."
                  onClick={() => void actions.unshare(app)}
                  size="sm"
                  variant="outline"
                >
                  Unshare
                </FgButton>
              </FgTooltip>
            ) : (
              <FgTooltip label="Share to catalog">
                <FgButton
                  icon={FaUsers}
                  onClick={() => actions.requestShare(app)}
                  size="sm"
                  variant="outline"
                >
                  Share to Catalog
                </FgButton>
              </FgTooltip>
            )}
            <FgTooltip label="Update to the latest version">
              <FgButton
                disabled={actions.updating}
                icon={HiOutlineRefresh}
                loading={actions.updating}
                loadingText="Updating..."
                onClick={() => void actions.update(app)}
                size="sm"
                variant="outline"
              >
                Update
              </FgButton>
            </FgTooltip>
            {runnables.length === 0 ? (
              <FgButton
                icon={HiOutlinePlay}
                onClick={() => actions.launch(app)}
                size="sm"
              >
                Launch
              </FgButton>
            ) : null}
            <CardActionsMenu<UserApp>
              actionProps={app}
              menuItems={menuItems}
              triggerIcon={HiOutlineEllipsisVertical}
            />
          </>
        }
        icon={getAppIconType(app.manifest)}
        title={app.name}
      >
        {isShared ? (
          <span className="inline-block px-2 py-0.5 rounded-sm bg-success/10 text-success text-xs font-medium flex-shrink-0">
            Shared
          </span>
        ) : null}
      </AppPageHeader>

      <div className="max-w-2xl">
        <AppInfoTable app={app} />

        <EntryPointsList
          onLaunch={ep => actions.launch(app, ep.id)}
          runnables={runnables}
        />

        {recentJobs.length > 0 ? (
          <div className="mt-8">
            <Typography
              className="text-foreground font-semibold mb-3"
              type="h6"
            >
              Recent Jobs
            </Typography>
            <div className="flex flex-col divide-y divide-surface-light dark:divide-surface border border-surface-light dark:border-surface rounded-lg">
              {recentJobs.map(job => (
                <Link
                  className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-surface dark:hover:bg-surface-light first:rounded-t-lg last:rounded-b-lg"
                  key={job.id}
                  to={`/apps/jobs/${job.id}`}
                >
                  <JobStatusBadge status={job.status} />
                  <Typography className="text-foreground text-sm font-medium truncate">
                    {job.entry_point_name}
                  </Typography>
                  <Typography
                    className="text-foreground/70 text-xs ml-auto flex-shrink-0"
                    type="small"
                  >
                    {formatDateString(job.created_at)}
                  </Typography>
                </Link>
              ))}
            </div>
            {appJobs.length > RECENT_JOBS_LIMIT ? (
              <Typography className="mt-2 text-sm">
                <FgLink to="/apps/jobs">View all {appJobs.length} jobs</FgLink>
              </Typography>
            ) : null}
          </div>
        ) : null}
      </div>

      <AppActionDialogs actions={actions} />
    </div>
  );
}
