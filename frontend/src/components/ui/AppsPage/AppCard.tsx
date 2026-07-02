import type { KeyboardEvent } from 'react';

import { Card, Typography } from '@material-tailwind/react';
import { HiOutlinePlay } from 'react-icons/hi';
import { HiOutlineEllipsisVertical } from 'react-icons/hi2';

import CardActionsMenu from '@/components/ui/Menus/CardActionsMenu';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import type { AppActions } from '@/hooks/useAppActions';
import { getAppIconType } from '@/utils';
import type { UserApp } from '@/shared.types';

interface AppCardProps {
  readonly app: UserApp;
  readonly actions: AppActions;
}

export default function AppCard({ app, actions }: AppCardProps) {
  const isShared = app.listing_id !== undefined && app.listing_id !== null;

  const menuItems: MenuItem<UserApp>[] = [
    { name: 'Launch', action: a => actions.launch(a) },
    { name: 'View', action: a => actions.view(a) },
    {
      name: 'Share to Catalog',
      action: a => actions.requestShare(a),
      shouldShow: !isShared
    },
    {
      name: 'Unshare',
      action: a => void actions.unshare(a),
      shouldShow: isShared
    },
    { name: 'Update', action: a => void actions.update(a) },
    {
      name: 'Remove',
      action: a => actions.requestRemove(a),
      color: 'text-error'
    }
  ];

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
      className="p-0 flex flex-col text-left w-full dark:border-surface-light cursor-pointer transition-colors hover:bg-surface dark:hover:bg-surface-light"
      onClick={handleView}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
    >
      <div className="px-3 py-2 rounded-t-lg bg-surface dark:bg-surface-light border-b border-surface-light dark:border-surface flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FgIcon
            className="text-foreground flex-shrink-0"
            icon={getAppIconType(app.manifest)}
          />
          {isShared ? (
            <span className="inline-block px-2 py-0.5 rounded-sm bg-success/10 text-success text-xs font-medium">
              Shared
            </span>
          ) : null}
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

        {app.description ? (
          <Typography className="text-sm md:text-base text-foreground">
            {app.description}
          </Typography>
        ) : null}
      </div>
    </Card>
  );
}
