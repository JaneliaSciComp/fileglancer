import { useState } from 'react';
import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
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
  const [keyName, setKeyName] = useState('id_ed25519_fileglancer');
  const [comment, setComment] = useState('');
  const [addToAuthorized, setAddToAuthorized] = useState(true);

  const generateMutation = useGenerateSSHKeyMutation();

  const handleClose = () => {
    setShowDialog(false);
    // Reset form
    setKeyName('id_ed25519_fileglancer');
    setComment('');
    setAddToAuthorized(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!keyName.trim()) {
      toast.error('Key name is required');
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({
        key_name: keyName.trim(),
        comment: comment.trim() || undefined,
        add_to_authorized_keys: addToAuthorized
      });

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
      <form onSubmit={handleSubmit}>
        <Typography className="text-foreground font-semibold text-lg mb-4">
          Generate New SSH Key
        </Typography>

        <Typography className="text-secondary text-sm mb-4">
          This will create a new ed25519 SSH key pair in your ~/.ssh directory.
          The key can be used to authenticate with other systems.
        </Typography>

        <div className="flex flex-col gap-4 mb-6">
          <div>
            <Typography
              as="label"
              className="text-foreground font-medium mb-1 block"
              htmlFor="key_name"
            >
              Key Name
            </Typography>
            <input
              autoFocus
              className="w-full p-2 text-foreground border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
              id="key_name"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setKeyName(event.target.value);
              }}
              placeholder="id_ed25519_mykey"
              type="text"
              value={keyName}
            />
            <Typography className="text-secondary text-xs mt-1">
              Only letters, numbers, underscores, and hyphens are allowed.
            </Typography>
          </div>

          <div>
            <Typography
              as="label"
              className="text-foreground font-medium mb-1 block"
              htmlFor="comment"
            >
              Comment (optional)
            </Typography>
            <input
              className="w-full p-2 text-foreground border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
              id="comment"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setComment(event.target.value);
              }}
              placeholder="your.email@example.com"
              type="text"
              value={comment}
            />
            <Typography className="text-secondary text-xs mt-1">
              A comment to help identify this key (usually an email address).
            </Typography>
          </div>

          <div className="flex items-center gap-2">
            <input
              checked={addToAuthorized}
              className="icon-small checked:accent-secondary-light"
              id="add_to_authorized"
              onChange={() => {
                setAddToAuthorized(!addToAuthorized);
              }}
              type="checkbox"
            />
            <Typography
              as="label"
              className="text-foreground"
              htmlFor="add_to_authorized"
            >
              Add to authorized_keys (enables SSH to cluster)
            </Typography>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button onClick={handleClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={generateMutation.isPending} type="submit">
            {generateMutation.isPending ? (
              <Spinner customClasses="border-white" text="Generating..." />
            ) : (
              'Generate Key'
            )}
          </Button>
        </div>
      </form>
    </FgDialog>
  );
}
