import { useState } from 'react';
import { Button, Typography } from '@material-tailwind/react';

import FgDialog from './FgDialog';

type EditDataLinkLabelDialogProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly currentLabel: string;
  readonly onConfirm: (newLabel: string) => Promise<void>;
};

export default function EditDataLinkLabelDialog({
  open,
  onClose,
  currentLabel,
  onConfirm
}: EditDataLinkLabelDialogProps) {
  const [label, setLabel] = useState(currentLabel);
  const [saving, setSaving] = useState(false);

  const isValid = label.trim().length > 0;
  const hasChanged = label !== currentLabel;

  const handleSave = async () => {
    if (!isValid || !hasChanged) {
      return;
    }
    setSaving(true);
    try {
      await onConfirm(label.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <FgDialog onClose={onClose} open={open}>
      <div className="flex flex-col gap-4 my-4">
        <Typography className="text-foreground font-semibold">
          Edit Data Link Label
        </Typography>
        <Typography className="text-foreground" variant="small">
          The label is only used in the data links table - it is useful for grouping data links via the sort and search functionality. Changing it will not
          affect the sharing URL.
        </Typography>
        <input
          autoFocus
          className="p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
          onChange={e => setLabel(e.target.value)}
          placeholder="Enter label"
          type="text"
          value={label}
        />
        <div className="flex gap-4">
          <Button
            className="!rounded-md"
            color="primary"
            disabled={!isValid || !hasChanged || saving}
            onClick={handleSave}
            variant="outline"
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
          <Button
            className="!rounded-md"
            onClick={onClose}
            variant="outline"
            color="error"
          >
            Cancel
          </Button>
        </div>
      </div>
    </FgDialog>
  );
}
