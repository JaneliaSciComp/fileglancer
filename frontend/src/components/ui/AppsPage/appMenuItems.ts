import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import type { AppActions } from '@/hooks/useAppActions';
import type { UserApp } from '@/shared.types';

/** True when the app has been shared to the catalog. */
export function isAppShared(app: UserApp): boolean {
  return app.listing_id !== undefined && app.listing_id !== null;
}

/**
 * Actions menu items for a user app, shared by the My Apps card and table
 * views.
 */
export function buildAppMenuItems(
  app: UserApp,
  actions: AppActions
): MenuItem<UserApp>[] {
  const isShared = isAppShared(app);
  return [
    { name: 'Launch', action: a => actions.launch(a) },
    { name: 'View', action: a => actions.view(a) },
    { name: 'Rename', action: a => actions.requestRename(a) },
    {
      name: 'Share to Catalog',
      action: a => actions.requestShare(a),
      shouldShow: !isShared
    },
    {
      name: 'Unshare',
      action: a => actions.requestUnshare(a),
      shouldShow: isShared
    },
    { name: 'Update', action: a => void actions.update(a) },
    {
      name: 'Remove',
      action: a => actions.requestRemove(a),
      color: 'text-error'
    }
  ];
}
