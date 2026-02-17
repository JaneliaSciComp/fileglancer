import { useState, type ReactNode, type MouseEvent } from 'react';
import type { IconType } from 'react-icons';

import FgTooltip from '@/components/ui/widgets/FgTooltip';
import FgDialog from '@/components/ui/Dialogs/FgDialog';

type DialogIconBtnProps = {
  readonly icon: IconType;
  readonly label: string;
  readonly triggerClasses: string;
  readonly disabled?: boolean;
  readonly children: ReactNode | ((closeDialog: () => void) => ReactNode);
};

export default function DialogIconBtn({
  icon,
  label,
  triggerClasses,
  disabled = false,
  children
}: DialogIconBtnProps) {
  const [showDialog, setShowDialog] = useState(false);

  const closeDialog = () => setShowDialog(false);

  return (
    <>
      <FgTooltip
        as="button"
        disabledCondition={disabled}
        icon={icon}
        label={label}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          setShowDialog(true);
          e.currentTarget.blur();
        }}
        triggerClasses={triggerClasses}
      />
      {showDialog ? (
        <FgDialog onClose={closeDialog} open={showDialog}>
          {typeof children === 'function' ? children(closeDialog) : children}
        </FgDialog>
      ) : null}
    </>
  );
}
