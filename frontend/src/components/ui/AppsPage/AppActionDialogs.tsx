import DeleteAppDialog from '@/components/ui/AppsPage/DeleteAppDialog';
import ShareAppDialog from '@/components/ui/AppsPage/ShareAppDialog';
import type { AppActions } from '@/hooks/useAppActions';

/**
 * The confirmation/share dialogs backing the two-step app actions from
 * `useAppActions`. Render once per page that uses the hook.
 */
export default function AppActionDialogs({
  actions
}: {
  readonly actions: AppActions;
}) {
  return (
    <>
      <ShareAppDialog
        app={actions.shareTarget}
        onClose={actions.closeShare}
        onShare={actions.share}
        open={actions.shareTarget !== null}
        sharing={actions.sharing}
      />
      <DeleteAppDialog
        app={actions.removeTarget}
        onClose={actions.closeRemove}
        onConfirm={actions.confirmRemove}
        open={actions.removeTarget !== null}
        removing={actions.removing}
      />
    </>
  );
}
