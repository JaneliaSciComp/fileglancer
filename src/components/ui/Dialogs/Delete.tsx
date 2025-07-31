import React from 'react';
import { Button } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import TextWithFilePath from '@/components/ui/Dialogs/TextWithFilePath';
import useDeleteDialog from '@/hooks/useDeleteDialog';
import type { FileOrFolder } from '@/shared.types';
import { getPreferredPathForDisplay } from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';

type DeleteDialogProps = {
  targetItem: FileOrFolder;
  showDeleteDialog: boolean;
  setShowDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function DeleteDialog({
  targetItem,
  showDeleteDialog,
  setShowDeleteDialog
}: DeleteDialogProps): JSX.Element {
  const { handleDelete } = useDeleteDialog();
  const { currentFileSharePath } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();

  if (!currentFileSharePath) {
    return <>{toast.error('No file share path selected')}</>; // No file share path available
  }

  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    currentFileSharePath,
    targetItem.path
  );

  return (
    <FgDialog
      open={showDeleteDialog}
      onClose={() => setShowDeleteDialog(false)}
    >
      <TextWithFilePath
        text="Are you sure you want to delete this item?"
        path={displayPath}
      />
      <Button
        color="error"
        className="!rounded-md"
        onClick={async () => {
          const result = await handleDelete(targetItem);
          if ('error' in result) {
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
