import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from './FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import type { FileSharePath } from '@/shared.types';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useDeleteCloudBucketMutation } from '@/queries/cloudStorageQueries';
import { makeMapKey } from '@/utils';

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
  const { fileSharePathPreferenceMap, folderFavorites, handleFavoriteChange } =
    usePreferencesContext();

  const handleRemove = async () => {
    try {
      const { removed_links } = await deleteBucketMutation.mutateAsync({
        name: fsp.name
      });
      toast.success(
        `Removed bucket "${fsp.storage}"` +
          (removed_links > 0
            ? ` and ${removed_links} data link${removed_links === 1 ? '' : 's'}`
            : '')
      );
      // ponytail: each toggle rewrites the whole folder list from this render's
      // preferences, so with several folder favorites on one bucket only the
      // last removal sticks; batch them into one preference write if that matters.
      if (fileSharePathPreferenceMap[makeMapKey('fsp', fsp.name)]) {
        await handleFavoriteChange(fsp, 'fileSharePath');
      }
      for (const folder of folderFavorites) {
        if (folder.fsp.name === fsp.name) {
          await handleFavoriteChange(folder, 'folder');
        }
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
        Remove "{fsp.storage}" from your Cloud Storage? Data links you created
        on it will be removed too. The bucket itself is not changed.
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
