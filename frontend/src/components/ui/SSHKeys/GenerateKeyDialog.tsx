import type { Dispatch, SetStateAction } from 'react';
import { Button, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import { Spinner } from '@/components/ui/widgets/Loaders';
import { useGenerateSSHKeyMutation } from '@/queries/sshKeyQueries';

type GenerateKeyDialogProps = {
  readonly showDialog: boolean;
  readonly setShowDialog: Dispatch<SetStateAction<boolean>>;
};

export default function GenerateKeyDialog({
  showDialog,
  setShowDialog
}: GenerateKeyDialogProps) {
  const generateMutation = useGenerateSSHKeyMutation();

  const handleClose = () => {
    setShowDialog(false);
  };

  const handleGenerate = async () => {
    try {
      const result = await generateMutation.mutateAsync();
      toast.success(result.message);
      handleClose();
    } catch (error) {
      toast.error(
        `Failed to generate key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  return (
    <FgDialog onClose={handleClose} open={showDialog}>
      <Typography className="text-foreground font-semibold text-lg mb-4">
        Generate SSH Key
      </Typography>

      <Typography className="text-secondary text-sm mb-4">
        This will create a new ed25519 SSH key pair (
        <span className="font-mono text-xs">id_ed25519</span>) in your ~/.ssh
        directory and add it to your authorized_keys file.
      </Typography>

      <Typography className="text-secondary text-sm mb-6">
        Once created, you can use this key to SSH to cluster nodes and copy the
        private key for use with Seqera Platform.
      </Typography>

      <div className="flex gap-2 justify-end">
        <Button onClick={handleClose} type="button" variant="outline">
          Cancel
        </Button>
        <Button
          disabled={generateMutation.isPending}
          onClick={handleGenerate}
          type="button"
        >
          {generateMutation.isPending ? (
            <Spinner customClasses="border-white" text="Generating..." />
          ) : (
            'Generate Key'
          )}
        </Button>
      </div>
    </FgDialog>
  );
}
