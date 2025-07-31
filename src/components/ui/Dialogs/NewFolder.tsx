import React from 'react';
import { Button, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import useNewFolderDialog from '@/hooks/useNewFolderDialog';
import FgDialog from './FgDialog';

type ItemNamingDialogProps = {
  showNewFolderDialog: boolean;
  setShowNewFolderDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function NewFolderDialog({
  showNewFolderDialog,
  setShowNewFolderDialog
}: ItemNamingDialogProps): JSX.Element {
  const { handleNewFolderSubmit, newName, setNewName } = useNewFolderDialog();

  return (
    <FgDialog
      open={showNewFolderDialog}
      onClose={() => setShowNewFolderDialog(false)}
    >
      <form
        onSubmit={async event => {
          event.preventDefault();
          const result = await handleNewFolderSubmit();
          if (result.success) {
            toast.success('New folder created!');
          } else {
            toast.error(`Error creating folder: ${result.error}`);
          }
          setShowNewFolderDialog(false);
          setNewName('');
        }}
      >
        <div className="mt-8 flex flex-col gap-2">
          <Typography
            as="label"
            htmlFor="new_name"
            className="text-foreground font-semibold"
          >
            New Folder Name
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
