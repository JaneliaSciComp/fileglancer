import { useState, type ReactNode, type MouseEvent } from 'react';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';

type TextDialogBtnProps = {
  readonly label: string;
  readonly variant?: 'solid' | 'outline' | 'ghost' | 'link' | undefined;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly children: ReactNode | ((closeDialog: () => void) => ReactNode);
};

export default function TextDialogBtn({
  label,
  variant = 'solid',
  className = 'w-fit',
  disabled = false,
  children
}: TextDialogBtnProps) {
  const [showDialog, setShowDialog] = useState(false);

  const closeDialog = () => setShowDialog(false);

  return (
    <>
      <FgButton
        className={className}
        disabled={disabled}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          setShowDialog(true);
          e.currentTarget.blur();
        }}
        variant={variant ? variant : 'solid'}
      >
        {label}
      </FgButton>
      {showDialog ? (
        <FgDialog onClose={closeDialog} open={showDialog}>
          {typeof children === 'function' ? children(closeDialog) : children}
        </FgDialog>
      ) : null}
    </>
  );
}
