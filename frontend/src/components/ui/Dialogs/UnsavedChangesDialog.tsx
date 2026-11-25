import { Typography } from '@material-tailwind/react';

import FgDialog from './FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';

type UnsavedChangesDialogProps = {
  readonly message: string;
  readonly saving: boolean;
  readonly onSave: () => void;
  /** Omit when the action can't run without a save. */
  readonly onContinue?: () => void;
  readonly onClose: () => void;
  readonly title?: string;
};

/** Asks the owner to save a View's unsaved edits before an action. */
export default function UnsavedChangesDialog({
  message,
  saving,
  onSave,
  onContinue,
  onClose,
  title = 'Unsaved changes'
}: UnsavedChangesDialogProps) {
  return (
    <FgDialog onClose={onClose} open>
      <div className="flex flex-col gap-3 my-4">
        <Typography className="text-foreground font-semibold">
          {title}
        </Typography>
        <Typography className="text-foreground text-sm">{message}</Typography>
        <div className="flex gap-4">
          <FgButton loading={saving} onClick={onSave}>
            Save and continue
          </FgButton>
          {onContinue ? (
            <FgButton disabled={saving} onClick={onContinue} variant="outline">
              Continue without saving
            </FgButton>
          ) : null}
          <FgButton disabled={saving} onClick={onClose} variant="ghost">
            Cancel
          </FgButton>
        </div>
      </div>
    </FgDialog>
  );
}
