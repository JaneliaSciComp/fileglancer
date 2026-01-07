import type { Dispatch, SetStateAction } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import DeleteBtn from '@/components/ui/buttons/DeleteBtn';
import { useDeleteSSHKeyMutation } from '@/queries/sshKeyQueries';
import type { SSHKeyInfo } from '@/queries/sshKeyQueries';

type DeleteSSHKeyDialogProps = {
  readonly showDialog: boolean;
  readonly setShowDialog: Dispatch<SetStateAction<boolean>>;
  readonly keyInfo: SSHKeyInfo;
};

export default function DeleteSSHKeyDialog({
  showDialog,
  setShowDialog,
  keyInfo
}: DeleteSSHKeyDialogProps) {
  const deleteMutation = useDeleteSSHKeyMutation();

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ key_name: keyInfo.filename });
      toast.success(`Key "${keyInfo.filename}" deleted successfully`);
    } catch (error) {
      toast.error(
        `Failed to delete key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setShowDialog(false);
    }
  };

  return (
    <FgDialog
      className="flex flex-col gap-4"
      onClose={() => setShowDialog(false)}
      open={showDialog}
    >
      <div className="flex flex-col gap-2 pr-8">
        <Typography className="text-foreground font-semibold">
          Delete SSH Key?
        </Typography>
        <Typography className="text-secondary">
          Are you sure you want to delete the SSH key{' '}
          <span className="font-mono text-foreground">{keyInfo.filename}</span>?
        </Typography>
        <Typography className="text-secondary text-sm">
          This will remove both the private and public key files from your
          ~/.ssh directory, and remove the key from authorized_keys if present.
          Backup copies will be saved with a .deleted extension.
        </Typography>
      </div>
      <DeleteBtn
        disabled={deleteMutation.isPending}
        onClick={handleDelete}
        pending={deleteMutation.isPending}
      />
    </FgDialog>
  );
}
