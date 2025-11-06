import { useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import { Button, Typography } from '@material-tailwind/react';
import { HiFolderAdd } from 'react-icons/hi';
import toast from 'react-hot-toast';

import FgTooltip from '@/components/ui/widgets/FgTooltip';
import FgDialog from '@/components/ui/Dialogs/FgDialog';
import { Spinner } from '@/components/ui/widgets/Loaders';
import useNewFolderDialog from '@/hooks/useNewFolderDialog';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

type NewFolderButtonProps = {
  readonly triggerClasses: string;
};

export default function NewFolderButton({
  triggerClasses
}: NewFolderButtonProps) {
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const { fileBrowserState, mutations } = useFileBrowserContext();
  const { handleNewFolderSubmit, newName, setNewName, isDuplicateName } =
    useNewFolderDialog();

  const isSubmitDisabled =
    !newName.trim() || isDuplicateName || mutations.createFolder.isPending;

  const formSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await handleNewFolderSubmit();
    if (result.success) {
      toast.success('New folder created!');
      setNewName('');
    } else {
      toast.error(`Error creating folder: ${result.error}`);
    }
    setShowNewFolderDialog(false);
  };

  return (
    <>
      <FgTooltip
        as="button"
        disabledCondition={!fileBrowserState.uiFileSharePath}
        icon={HiFolderAdd}
        label="New folder"
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          setShowNewFolderDialog(true);
          e.currentTarget.blur();
        }}
        triggerClasses={triggerClasses}
      />
      {showNewFolderDialog ? (
        <FgDialog
          onClose={() => setShowNewFolderDialog(false)}
          open={showNewFolderDialog}
        >
          <form onSubmit={formSubmit}>
            <div className="mt-8 flex flex-col gap-2">
              <Typography
                as="label"
                className="text-foreground font-semibold"
                htmlFor="new_name"
              >
                Create a New Folder
              </Typography>
              <input
                autoFocus
                className="mb-4 p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
                id="new_name"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setNewName(event.target.value);
                }}
                placeholder="Folder name ..."
                type="text"
                value={newName}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="!rounded-md"
                disabled={isSubmitDisabled}
                type="submit"
              >
                {mutations.createFolder.isPending ? (
                  <Spinner customClasses="border-white" text="Creating..." />
                ) : (
                  'Submit'
                )}
              </Button>
              {!newName.trim() ? (
                <Typography className="text-sm text-gray-500">
                  Please enter a folder name
                </Typography>
              ) : newName.trim() && isDuplicateName ? (
                <Typography className="text-sm text-red-500">
                  A file or folder with this name already exists
                </Typography>
              ) : null}
            </div>
          </form>
        </FgDialog>
      ) : null}
    </>
  );
}
