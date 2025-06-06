import React from 'react';
import {
  Button,
  Dialog,
  IconButton,
  Typography
} from '@material-tailwind/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

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
    <Dialog open={showDeleteDialog}>
      <Dialog.Overlay>
        <Dialog.Content className="bg-surface-light dark:bg-surface">
          <IconButton
            size="sm"
            variant="outline"
            color="secondary"
            className="absolute right-2 top-2 text-secondary hover:text-background"
            isCircular
            onClick={() => {
              setShowDeleteDialog(false);
            }}
          >
            <XMarkIcon className="icon-default" />
          </IconButton>
          <Typography className="my-8 text-large text-foreground">
            Are you sure you want to delete{' '}
            <span className="font-semibold">{displayPath}</span>?
          </Typography>
          <Button
            color="error"
            className="!rounded-md"
            onClick={async () => {
              const success = await handleDelete(targetItem);
              if (success) {
                setShowDeleteDialog(false);
              }
            }}
          >
            Delete
          </Button>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog>
  );
}
