import React from 'react';
import toast from 'react-hot-toast';
import {
  Alert,
  Button,
  Dialog,
  IconButton,
  Typography
} from '@material-tailwind/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

import type { FileOrFolder } from '@/shared.types';
import useRenameDialog from '@/hooks/useRenameDialog';

type ItemNamingDialogProps = {
  propertiesTarget: FileOrFolder | null;
  showRenameDialog: boolean;
  setShowRenameDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function RenameDialog({
  propertiesTarget,
  showRenameDialog,
  setShowRenameDialog
}: ItemNamingDialogProps): JSX.Element {
  const { handleRenameSubmit, newName, setNewName } = useRenameDialog();

  return (
    <Dialog open={showRenameDialog}>
      <Dialog.Overlay>
        <Dialog.Content className="bg-surface-light dark:bg-surface">
          <IconButton
            size="sm"
            variant="outline"
            color="secondary"
            className="absolute right-2 top-2 text-secondary hover:text-background"
            isCircular
            onClick={() => {
              setShowRenameDialog(false);
              setNewName('');
            }}
          >
            <XMarkIcon className="icon-default" />
          </IconButton>
          <form
            onSubmit={async event => {
              event.preventDefault();
              const result = await handleRenameSubmit(
                `${propertiesTarget?.path}`
              );

              if (result.success) {
                toast.success('Item renamed successfully');
              } else if (result.error) {
                toast.error(`Failed to rename item: ${result.error}`);
              }
              setShowRenameDialog(false);
              setNewName('');
            }}
          >
            <div className="mt-8 flex flex-col gap-2">
              <Typography
                as="label"
                htmlFor="new_name"
                className="text-foreground font-semibold"
              >
                Rename Item
              </Typography>
              <input
                type="text"
                id="new_name"
                autoFocus
                value={newName}
                placeholder="Enter name"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  setNewName(event.target.value);
                }}
                className="mb-4 p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
              />
            </div>
            <Button className="!rounded-md" type="submit">
              Submit
            </Button>
          </form>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog>
  );
}
