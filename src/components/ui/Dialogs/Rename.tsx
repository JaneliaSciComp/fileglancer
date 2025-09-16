import React from 'react';
import { Button, Typography } from '@material-tailwind/react';

import useRenameDialog from '@/hooks/useRenameDialog';
import FgDialog from './FgDialog';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import toast from 'react-hot-toast';

type ItemNamingDialogProps = {
  readonly showRenameDialog: boolean;
  readonly setShowRenameDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function RenameDialog({
  showRenameDialog,
  setShowRenameDialog
}: ItemNamingDialogProps): JSX.Element {
  const { fileBrowserState } = useFileBrowserContext();
  const { handleRenameSubmit, newName, setNewName } = useRenameDialog();

  return (
    <FgDialog
      onClose={() => setShowRenameDialog(false)}
      open={showRenameDialog}
    >
      <form
        onSubmit={async event => {
          event.preventDefault();

          if (!fileBrowserState.propertiesTarget) {
            toast.error(`No target file selected`);
            return;
          }

          const result = await handleRenameSubmit(
            `${fileBrowserState.propertiesTarget.path}`
          );
          if (result.success) {
            toast.success('Item renamed successfully!');
          } else {
            toast.error(`Error renaming item: ${result.error}`);
          }
          setShowRenameDialog(false);
          setNewName('');
        }}
      >
        <div className="mt-8 flex flex-col gap-2">
          <Typography
            as="label"
            className="text-foreground font-semibold"
            htmlFor="new_name"
          >
            Rename Item
          </Typography>
          <input
            autoFocus
            className="mb-4 p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
            id="new_name"
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              setNewName(event.target.value);
            }}
            placeholder="Enter name"
            type="text"
            value={newName}
          />
        </div>
        <Button className="!rounded-md" type="submit">
          Submit
        </Button>
      </form>
    </FgDialog>
  );
}
