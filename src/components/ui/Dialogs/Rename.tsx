import React from 'react';
import { Button, Typography } from '@material-tailwind/react';

import useRenameDialog from '@/hooks/useRenameDialog';
import FgDialog from './FgDialog';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import toast from 'react-hot-toast';

type ItemNamingDialogProps = {
  showRenameDialog: boolean;
  setShowRenameDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function RenameDialog({
  showRenameDialog,
  setShowRenameDialog
}: ItemNamingDialogProps): JSX.Element {
  const { propertiesTarget } = useFileBrowserContext();
  const { handleRenameSubmit, newName, setNewName } = useRenameDialog();

  return (
    <FgDialog
      open={showRenameDialog}
      onClose={() => setShowRenameDialog(false)}
    >
      <form
        onSubmit={async event => {
          event.preventDefault();

          if (!propertiesTarget) {
            toast.error(`No target file selected`);
            return;
          }

          const result = await handleRenameSubmit(`${propertiesTarget.path}`);
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
    </FgDialog>
  );
}
