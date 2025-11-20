import type { Dispatch, SetStateAction } from 'react';
import toast from 'react-hot-toast';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import TextWithFilePath from '@/components/ui/Dialogs/TextWithFilePath';
import DeleteBtn from '@/components/ui/buttons/DeleteBtn';
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
  const { fileQuery, fileBrowserState, mutations } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();

  if (!fileQuery.data?.currentFileSharePath) {
    return <>{toast.error('No file share path selected')}</>; // No file share path available
  }

  if (!fileBrowserState.propertiesTarget) {
    return <>{toast.error('No target file selected')}</>; // No target file available
  }

  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    fileQuery.data.currentFileSharePath,
    fileBrowserState.propertiesTarget.path
  );

  return (
    <FgDialog
      className="flex flex-col gap-4"
      onClose={() => setShowDeleteDialog(false)}
      open={showDeleteDialog}
    >
      <TextWithFilePath
        path={displayPath}
        text="Are you sure you want to delete this item?"
      />
      <DeleteBtn
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
        pending={mutations.delete.isPending}
      />
    </FgDialog>
  );
}
