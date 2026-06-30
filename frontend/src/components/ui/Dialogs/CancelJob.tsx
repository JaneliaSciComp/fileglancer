import { Typography } from '@material-tailwind/react';
import { HiOutlineStop } from 'react-icons/hi';

import FgButton from '@/components/designSystem/atoms/FgButton';
import FgDialog from '@/components/ui/Dialogs/FgDialog';

type CancelJobDialogProps = {
  readonly open: boolean;
  readonly isService: boolean;
  readonly isPending: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
};

export default function CancelJobDialog({
  open,
  isService,
  isPending,
  onClose,
  onConfirm
}: CancelJobDialogProps) {
  return (
    <FgDialog onClose={onClose} open={open}>
      <Typography className="text-foreground font-bold mb-2" type="h6">
        {isService ? 'Stop Service' : 'Cancel Job'}
      </Typography>
      <Typography className="text-foreground mb-4">
        {isService
          ? 'Are you sure you want to stop this service? It will be terminated and the URL will no longer be accessible.'
          : 'Are you sure you want to cancel this job? It will be terminated.'}
      </Typography>
      <div className="flex justify-end gap-2">
        <FgButton onClick={onClose} variant="ghost">
          Keep running
        </FgButton>
        <FgButton
          color="error"
          disabled={isPending}
          icon={HiOutlineStop}
          loading={isPending}
          loadingText={isService ? 'Stopping...' : 'Cancelling...'}
          onClick={onConfirm}
        >
          {isService ? 'Stop Service' : 'Cancel Job'}
        </FgButton>
      </div>
    </FgDialog>
  );
}
