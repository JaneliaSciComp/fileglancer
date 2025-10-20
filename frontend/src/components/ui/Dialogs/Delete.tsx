import React from 'react';
import { Button } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import TextWithFilePath from '@/components/ui/Dialogs/TextWithFilePath';
import useDeleteDialog from '@/hooks/useDeleteDialog';
import { getPreferredPathForDisplay } from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';

type DeleteDialogProps = {
  readonly showDeleteDialog: boolean;
  readonly setShowDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function DeleteDialog({
  showDeleteDialog,
  setShowDeleteDialog
}: DeleteDialogProps): JSX.Element {
  const { handleDelete } = useDeleteDialog();
  const { fileBrowserState } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();

  if (!fileBrowserState.currentFileSharePath) {
    return <>{toast.error('No file share path selected')}</>; // No file share path available
  }

  if (!fileBrowserState.propertiesTarget) {
    return <>{toast.error('No target file selected')}</>; // No target file available
  }

  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    fileBrowserState.currentFileSharePath,
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
        onClick={async () => {
          const result = await handleDelete(fileBrowserState.propertiesTarget!);
          if (!result.success) {
            toast.error(`Error deleting item: ${result.error}`);
          } else {
            toast.success(`Item deleted!`);
            setShowDeleteDialog(false);
          }
        }}
      >
        Delete
      </Button>
    </FgDialog>
  );
}
