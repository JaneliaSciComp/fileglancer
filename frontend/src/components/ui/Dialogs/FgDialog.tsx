import type { ReactNode } from 'react';
import { Dialog, IconButton } from '@material-tailwind/react';
import { HiX } from 'react-icons/hi';

type FgDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly className?: string;
};

export default function FgDialog({
  open,
  onClose,
  children,
  className = ''
}: FgDialogProps) {
  return (
    <Dialog onOpenChange={() => onClose()} open={open}>
      <Dialog.Overlay>
        <Dialog.Content className={`p-6 bg-surface-light ${className}`}>
          <IconButton
            className="absolute right-4 top-4 text-secondary hover:text-background rounded-full"
            color="secondary"
            onClick={onClose}
            size="sm"
            variant="outline"
          >
            <HiX className="icon-default" />
          </IconButton>
          {children}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog>
  );
}
