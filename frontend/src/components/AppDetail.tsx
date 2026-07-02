import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Card, Typography } from '@material-tailwind/react';
import { HiOutlinePlay, HiOutlineRefresh } from 'react-icons/hi';
import { HiOutlineEllipsisVertical } from 'react-icons/hi2';
import { FaUsers, FaUsersSlash } from 'react-icons/fa6';

import AppActionDialogs from '@/components/ui/AppsPage/AppActionDialogs';
import AppInfoTable from '@/components/ui/AppsPage/AppInfoTable';
import AppPageHeader from '@/components/ui/AppsPage/AppPageHeader';
import DataLinksActionsMenu from '@/components/ui/Menus/DataLinksActions';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import { useAppsQuery } from '@/queries/appsQueries';
import { useAppActions } from '@/hooks/useAppActions';
import {
  buildGithubUrl,
  canonicalGithubUrl,
  getAppIconType,
  getEntryPointIconType
} from '@/utils';
import type { UserApp } from '@/shared.types';

export default function AppDetail() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const appsQuery = useAppsQuery();
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
            <DataLinksActionsMenu<UserApp>
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

        {runnables.length > 0 ? (
          <>
            <Typography
              className="text-foreground font-semibold mb-3"
              type="h6"
            >
              Entry Points
            </Typography>
            <div className="space-y-4">
              {runnables.map(ep => (
                <Card
                  className="p-4 flex flex-col gap-2 text-left w-full dark:border-surface-light"
                  key={ep.id}
                >
                  <div className="flex items-center gap-2">
                    <FgIcon
                      className="text-foreground"
                      icon={getEntryPointIconType(ep)}
                    />
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
                    className="self-start"
                    icon={HiOutlinePlay}
                    onClick={() => actions.launch(app, ep.id)}
                    size="sm"
                  >
                    Launch
                  </FgButton>
                </Card>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <AppActionDialogs actions={actions} />
    </div>
  );
}
