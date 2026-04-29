import type { ChangeEvent } from 'react';
import { Typography } from '@material-tailwind/react';
import { HiFolderAdd } from 'react-icons/hi';
import toast from 'react-hot-toast';

import DialogIconBtn from '@/components/ui/buttons/DialogIconBtn';
import useNewFolderDialog from '@/hooks/useNewFolderDialog';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgFormField from '@/components/designSystem/molecules/FgFormField';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';

type NewFolderButtonProps = {
  readonly triggerClasses: string;
};

export default function NewFolderButton({
  triggerClasses
}: NewFolderButtonProps) {
  const { fspName, mutations } = useFileBrowserContext();
  const {
    handleNewFolderSubmit,
    newName,
    setNewName,
    isDuplicateName,
    nameValidation
  } = useNewFolderDialog();

  const isSubmitDisabled =
    !newName.trim() ||
    !nameValidation.isValid ||
    isDuplicateName ||
    mutations.createFolder.isPending;

  const formSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
    closeDialog: () => void
  ) => {
    event.preventDefault();
    const result = await handleNewFolderSubmit();
    if (result.success) {
      toast.success('New folder created!');
      setNewName('');
    } else {
      toast.error(`Error creating folder: ${result.error}`);
    }
    closeDialog();
  };

  return (
    <DialogIconBtn
      disabled={!fspName}
      icon={HiFolderAdd}
      label="New folder"
      triggerClasses={triggerClasses}
    >
      {closeDialog => (
        <form onSubmit={e => formSubmit(e, closeDialog)}>
          <div className="mt-8 flex flex-col gap-2">
            <FgFormField
              error={nameValidation.errorMessage}
              htmlFor="new_name"
              label="Create a New Folder"
            >
              <FgInput
                autoFocus
                id="new_name"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setNewName(event.target.value);
                }}
                placeholder="Folder name ..."
                size="lg"
                type="text"
                value={newName}
              />
            </FgFormField>
          </div>
          <div className="flex items-center gap-2">
            <FgButton
              disabled={isSubmitDisabled}
              loading={mutations.createFolder.isPending}
              loadingText="Creating..."
              type="submit"
            >
              Submit
            </FgButton>
            {!newName.trim() ? (
              <Typography className="text-sm text-foreground/60">
                Please enter a folder name
              </Typography>
            ) : newName.trim() && isDuplicateName ? (
              <Typography className="text-sm text-error">
                A file or folder with this name already exists
              </Typography>
            ) : null}
          </div>
        </form>
      )}
    </DialogIconBtn>
  );
}
