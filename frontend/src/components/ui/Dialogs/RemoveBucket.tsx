import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from './FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import type { FileSharePath } from '@/shared.types';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useDeleteCloudBucketMutation } from '@/queries/cloudStorageQueries';

type RemoveBucketDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly fsp: FileSharePath;
};

export default function RemoveBucketDialog({
  open,
  onClose,
  fsp
}: RemoveBucketDialogProps) {
  const deleteBucketMutation = useDeleteCloudBucketMutation();
  const { removeFavoritesForFsp } = usePreferencesContext();

  const handleRemove = async () => {
    try {
      await deleteBucketMutation.mutateAsync({ name: fsp.name });
      toast.success(`Removed bucket "${fsp.storage}"`);
      const cleanup = await removeFavoritesForFsp(fsp.name);
      if (!cleanup.success) {
        toast.error(cleanup.error);
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Remove failed');
    }
  };

  return (
    <FgDialog className="flex flex-col gap-4" onClose={onClose} open={open}>
      <Typography className="text-foreground font-semibold">
        Remove bucket
      </Typography>
      <Typography className="text-foreground" variant="small">
        Remove "{fsp.storage}" from your Cloud Storage? The bucket itself is not
        changed.
      </Typography>
      <div className="flex gap-3">
        <FgButton
          color="error"
          disabled={deleteBucketMutation.isPending}
          loading={deleteBucketMutation.isPending}
          loadingText="Removing..."
          onClick={handleRemove}
        >
          Remove
        </FgButton>
        <FgButton onClick={onClose} variant="ghost">
          Cancel
        </FgButton>
      </div>
    </FgDialog>
  );
}
