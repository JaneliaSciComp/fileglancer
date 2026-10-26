import DeleteAppDialog from '@/components/ui/AppsPage/DeleteAppDialog';
import RenameNameDialog from '@/components/ui/Dialogs/RenameName';
import ShareAppDialog from '@/components/ui/AppsPage/ShareAppDialog';
import UnshareDialog from '@/components/ui/AppsPage/UnshareDialog';
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
      <RenameNameDialog
        initialName={actions.renameTarget?.name ?? ''}
        onClose={actions.closeRename}
        onSave={name => {
          if (!actions.renameTarget) {
            return Promise.resolve();
          }
          return actions.rename(actions.renameTarget, name);
        }}
        open={actions.renameTarget !== null}
        saving={actions.renaming}
        title="Rename App"
      />
      <UnshareDialog
        name={actions.unshareTarget?.name}
        onClose={actions.closeUnshare}
        onConfirm={actions.confirmUnshare}
        open={actions.unshareTarget !== null}
        unsharing={actions.unsharing}
      />
    </>
  );
}
