import React from 'react';
import { Button, Typography } from '@material-tailwind/react';

import useRenameDialog from '@/hooks/useRenameDialog';
import FgDialog from './FgDialog';
import { Spinner } from '@/components/ui/widgets/Loaders';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import toast from 'react-hot-toast';

type ItemNamingDialogProps = {
  readonly showRenameDialog: boolean;
  readonly setShowRenameDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function RenameDialog({
  showRenameDialog,
  setShowRenameDialog
}: ItemNamingDialogProps): React.JSX.Element {
  const { fileBrowserState, mutations } = useFileBrowserContext();
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
            toast.error('No target file selected');
            return;
          }

          try {
            await handleRenameSubmit(
              `${fileBrowserState.propertiesTarget.path}`
            );
            toast.success('Item renamed successfully!');
            setNewName('');
          } catch (error) {
            toast.error(
              `Error renaming item: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          } finally {
            setShowRenameDialog(false);
          }
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
        <Button
          className="!rounded-md"
          disabled={mutations.rename.isPending}
          type="submit"
        >
          {mutations.rename.isPending ? (
            <Spinner customClasses="border-white" text="Renaming..." />
          ) : (
            'Submit'
          )}
        </Button>
      </form>
    </FgDialog>
  );
}
