import { useState, type ReactNode, type MouseEvent } from 'react';
import { Button } from '@material-tailwind/react';

import FgDialog from '@/components/ui/Dialogs/FgDialog';

type TextDialogBtnProps = {
  readonly label: string;
  readonly variant?: 'solid' | 'outline' | 'ghost' | 'gradient' | undefined;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly children: ReactNode | ((closeDialog: () => void) => ReactNode);
};

export default function TextDialogBtn({
  label,
  variant = 'outline',
  className = '!rounded-md w-fit',
  disabled = false,
  children
}: TextDialogBtnProps) {
  const [showDialog, setShowDialog] = useState(false);

  const closeDialog = () => setShowDialog(false);

  return (
    <>
      <Button
        className={className}
        disabled={disabled}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          setShowDialog(true);
          e.currentTarget.blur();
        }}
        variant={variant}
      >
        {label}
      </Button>
      {showDialog ? (
        <FgDialog onClose={closeDialog} open={showDialog}>
          {typeof children === 'function' ? children(closeDialog) : children}
        </FgDialog>
      ) : null}
    </>
  );
}
