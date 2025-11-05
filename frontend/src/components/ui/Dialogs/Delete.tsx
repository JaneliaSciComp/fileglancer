import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import TextWithFilePath from '@/components/ui/Dialogs/TextWithFilePath';
import { Spinner } from '@/components/ui/widgets/Loaders';
import useDeleteDialog from '@/hooks/useDeleteDialog';
import { getPreferredPathForDisplay } from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';

type DeleteDialogProps = {
  readonly showDeleteDialog: boolean;
  readonly setShowDeleteDialog: Dispatch<SetStateAction<boolean>>;
};

export default function DeleteDialog({
  showDeleteDialog,
  setShowDeleteDialog
}: DeleteDialogProps) {
  const { handleDelete } = useDeleteDialog();
  const { fileBrowserState, mutations } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();

  if (!fileBrowserState.uiFileSharePath) {
    return <>{toast.error('No file share path selected')}</>; // No file share path available
  }

  if (!fileBrowserState.propertiesTarget) {
    return <>{toast.error('No target file selected')}</>; // No target file available
  }

  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    fileBrowserState.uiFileSharePath,
    fileBrowserState.propertiesTarget.path
  );

  return (
    <FgDialog
      onClose={() => setShowDeleteDialog(false)}
      open={showDeleteDialog}
    >
      <TextWithFilePath
        path={displayPath}
        text="Are you sure you want to delete this item?"
      />
      <Button
        className="!rounded-md mt-4"
        color="error"
        disabled={mutations.delete.isPending}
        onClick={async () => {
          try {
            await handleDelete(fileBrowserState.propertiesTarget!);
            toast.success('Item deleted!');
          } catch (error) {
            toast.error(
              `Error deleting item: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          } finally {
            setShowDeleteDialog(false);
          }
        }}
      >
        {mutations.delete.isPending ? (
          <Spinner customClasses="border-white" text="Deleting..." />
        ) : (
          'Delete'
        )}
      </Button>
    </FgDialog>
  );
}
