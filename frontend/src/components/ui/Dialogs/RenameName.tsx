import { useEffect, useState } from 'react';
import { Typography } from '@material-tailwind/react';
import { HiOutlinePencilSquare } from 'react-icons/hi2';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgFormField from '@/components/designSystem/molecules/FgFormField';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';

interface RenameNameDialogProps {
  readonly open: boolean;
  /** Dialog heading, e.g. "Rename Job". */
  readonly title: string;
  readonly initialName: string;
  readonly onClose: () => void;
  readonly onSave: (name: string) => Promise<void>;
  readonly saving: boolean;
}

export default function RenameNameDialog({
  open,
  title,
  initialName,
  onClose,
  onSave,
  saving
}: RenameNameDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    try {
      await onSave(name.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename');
    }
  };

  return (
    <FgDialog className="max-w-lg" onClose={onClose} open={open}>
      <Typography className="text-foreground font-bold mb-4 pr-8" type="h6">
        {title}
      </Typography>
      <FgFormField htmlFor="rename-name" label="Name">
        <FgInput
          id="rename-name"
          onChange={e => {
            setName(e.target.value);
            setError('');
          }}
          type="text"
          value={name}
        />
      </FgFormField>
      {error ? (
        <Typography className="text-error mb-3" type="small">
          {error}
        </Typography>
      ) : null}
      <div className="flex gap-3">
        <FgButton
          disabled={!name.trim() || saving}
          icon={HiOutlinePencilSquare}
          loading={saving}
          loadingText="Saving..."
          onClick={handleSave}
        >
          Save
        </FgButton>
        <FgButton onClick={onClose} variant="ghost">
          Cancel
        </FgButton>
      </div>
    </FgDialog>
  );
}
