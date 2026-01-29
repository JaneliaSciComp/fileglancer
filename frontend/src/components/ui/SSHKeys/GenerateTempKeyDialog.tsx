import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Button, Input, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import { Spinner } from '@/components/ui/widgets/Loaders';
import { useGenerateTempKeyMutation } from '@/queries/sshKeyQueries';
import type { TempKeyResult } from '@/queries/sshKeyQueries';

type GenerateTempKeyDialogProps = {
  readonly showDialog: boolean;
  readonly setShowDialog: Dispatch<SetStateAction<boolean>>;
  readonly onKeyGenerated: (result: TempKeyResult) => void;
};

export default function GenerateTempKeyDialog({
  showDialog,
  setShowDialog,
  onKeyGenerated
}: GenerateTempKeyDialogProps) {
  const generateMutation = useGenerateTempKeyMutation();
  const [passphrase, setPassphrase] = useState('');

  const handleClose = () => {
    setShowDialog(false);
    setPassphrase('');
  };

  const handleGenerate = async () => {
    try {
      const result = await generateMutation.mutateAsync(
        passphrase ? { passphrase } : undefined
      );
      handleClose();
      onKeyGenerated(result);
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

      <Typography className="mb-4">
        This will create a new ed25519 SSH key pair and add the public key to
        your authorized_keys file. 
      </Typography>

      <div className="mb-6">
        <Typography className="text-foreground font-semibold">
          Passphrase (optional)
        </Typography>
        <Input
          disabled={generateMutation.isPending}
          onChange={e => setPassphrase(e.target.value)}
          placeholder="Leave empty for no passphrase"
          type="password"
          value={passphrase}
        />
        <Typography className="text-muted text-xs ml-1 mt-1">
          A passphrase adds extra security but must be entered each time you use
          the key.
        </Typography>
      </div>

      <div className="flex gap-2 justify-start">
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
        <Button onClick={handleClose} type="button" variant="outline">
          Cancel
        </Button>
      </div>
    </FgDialog>
  );
}
