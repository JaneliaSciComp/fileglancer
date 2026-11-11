import type { KeyboardEvent } from 'react';

import { Card, Typography } from '@material-tailwind/react';
import { HiOutlinePlay } from 'react-icons/hi';
import { HiOutlineEllipsisVertical } from 'react-icons/hi2';

import CardActionsMenu from '@/components/ui/Menus/CardActionsMenu';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import SharedBadge from '@/components/ui/AppsPage/SharedBadge';
import UpdateAvailableBadge from '@/components/ui/AppsPage/UpdateAvailableBadge';
import {
  buildAppMenuItems,
  isAppShared
} from '@/components/ui/AppsPage/appMenuItems';
import type { AppActions } from '@/hooks/useAppActions';
import { useAppUpdateAvailable } from '@/queries/appsQueries';
import { appRevision, getAppIconType, shortRevision } from '@/utils';
import type { UserApp } from '@/shared.types';

interface AppCardProps {
  readonly app: UserApp;
  readonly actions: AppActions;
}

export default function AppCard({ app, actions }: AppCardProps) {
  const isShared = isAppShared(app);
  const updateAvailable = useAppUpdateAvailable(app);
  const revision = appRevision(app.url, app.branch);

  const menuItems = buildAppMenuItems(app, actions);

  const handleView = () => actions.view(app);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      event.target === event.currentTarget
    ) {
      event.preventDefault();
      handleView();
    }
  };

  return (
    <Card
      className="p-0 flex flex-col text-left w-full dark:border-surface-light cursor-pointer transition-colors hover:bg-surface/50 dark:hover:bg-surface-light/20"
      onClick={handleView}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
    >
      <div className="px-3 py-2 rounded-t-lg bg-surface dark:bg-surface-light border-b border-surface-light dark:border-surface flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FgIcon
            className="text-foreground flex-shrink-0"
            icon={getAppIconType()}
          />
          {isShared ? <SharedBadge /> : null}
          {updateAvailable ? <UpdateAvailableBadge /> : null}
        </div>
        <div
          className="flex items-center gap-1"
          onClick={e => e.stopPropagation()}
        >
          <FgTooltip label="Launch this app">
            <FgButton
              icon={HiOutlinePlay}
              onClick={() => actions.launch(app)}
              size="sm"
            >
              Launch
            </FgButton>
          </FgTooltip>
          <CardActionsMenu<UserApp>
            actionProps={app}
            menuItems={menuItems}
            triggerIcon={HiOutlineEllipsisVertical}
          />
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <Typography
          className="text-foreground font-semibold truncate"
          type="h6"
        >
          {app.name}
        </Typography>

        {revision ? (
          <FgTooltip label={revision} triggerClasses="-mt-2 self-start">
            <Typography className="text-foreground/70 text-xs">
              {shortRevision(revision)}
            </Typography>
          </FgTooltip>
        ) : null}

        {app.description ? (
          <Typography className="text-sm md:text-base text-foreground">
            {app.description}
          </Typography>
        ) : null}
      </div>
    </Card>
  );
}
