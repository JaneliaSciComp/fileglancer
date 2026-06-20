import { Typography } from '@material-tailwind/react';
import { HiOutlineTrash } from 'react-icons/hi';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import type { UserApp } from '@/shared.types';

interface DeleteAppDialogProps {
  readonly app: UserApp | null;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly removing: boolean;
}

export default function DeleteAppDialog({
  app,
  open,
  onClose,
  onConfirm,
  removing
}: DeleteAppDialogProps) {
  return (
    <FgDialog onClose={onClose} open={open}>
      <Typography className="text-foreground font-bold mb-2" type="h6">
        Remove App
      </Typography>
      <Typography className="text-foreground mb-4">
        Are you sure you want to remove{' '}
        <span className="font-semibold">{app?.name ?? 'this app'}</span> from
        your apps? This will not delete any catalog listing you have for it, or
        affect other users.
      </Typography>
      <div className="flex justify-end gap-2">
        <FgButton onClick={onClose} variant="ghost">
          Cancel
        </FgButton>
        <FgButton
          color="error"
          disabled={removing}
          icon={HiOutlineTrash}
          loading={removing}
          loadingText="Removing..."
          onClick={onConfirm}
        >
          Remove
        </FgButton>
      </div>
    </FgDialog>
  );
}
