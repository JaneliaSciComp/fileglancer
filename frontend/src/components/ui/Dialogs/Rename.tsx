import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import toast from 'react-hot-toast';

import useRenameDialog from '@/hooks/useRenameDialog';
import FgDialog from './FgDialog';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgFormField from '@/components/designSystem/molecules/FgFormField';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';

type ItemNamingDialogProps = {
  readonly showRenameDialog: boolean;
  readonly setShowRenameDialog: Dispatch<SetStateAction<boolean>>;
};

export default function RenameDialog({
  showRenameDialog,
  setShowRenameDialog
}: ItemNamingDialogProps) {
  const { fileBrowserState, mutations } = useFileBrowserContext();
  const { handleRenameSubmit, newName, setNewName, nameValidation } =
    useRenameDialog();

  const submitForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!fileBrowserState.propertiesTarget) {
      toast.error('No target file selected');
      return;
    }

    const result = await handleRenameSubmit(
      `${fileBrowserState.propertiesTarget.path}`
    );
    if (result.success) {
      toast.success('Item renamed successfully!');
      setNewName('');
    } else {
      toast.error(`Error renaming item: ${result.error}`);
    }
    setShowRenameDialog(false);
  };

  return (
    <FgDialog
      onClose={() => setShowRenameDialog(false)}
      open={showRenameDialog}
    >
      <form onSubmit={submitForm}>
        <div className="mt-8 flex flex-col gap-2">
          <FgFormField
            error={nameValidation.errorMessage}
            htmlFor="new_name"
            label="Rename Item"
          >
            <FgInput
              autoFocus
              id="new_name"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setNewName(event.target.value);
              }}
              placeholder="Enter name"
              size="lg"
              type="text"
              value={newName}
            />
          </FgFormField>
        </div>
        <FgButton
          disabled={
            !newName.trim() ||
            !nameValidation.isValid ||
            mutations.rename.isPending
          }
          loading={mutations.rename.isPending}
          loadingText="Renaming..."
          type="submit"
        >
          Submit
        </FgButton>
      </form>
    </FgDialog>
  );
}
