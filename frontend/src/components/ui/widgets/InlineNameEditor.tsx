import { useState } from 'react';
import { IconButton, Typography } from '@material-tailwind/react';
import { HiOutlinePencilSquare } from 'react-icons/hi2';
import { HiOutlineCheck, HiOutlineX } from 'react-icons/hi';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import FgTooltip from '@/components/ui/widgets/FgTooltip';

type InlineNameEditorProps = {
  readonly value: string;
  readonly label: string;
  readonly onSave: (name: string) => Promise<void>;
  readonly className?: string;
  // ponytail: 'paragraph' isn't a valid Material Tailwind Typography `type`
  // (only h1-h6 | lead | p | small); 'p' is the closest body-text size.
  readonly typographyType?: 'h6' | 'lead' | 'p';
};

// Read-mode name with a pencil that swaps in an input + save/cancel. The
// caller owns the mutation and its toasts; reject from onSave to stay in
// edit mode.
export default function InlineNameEditor({
  value,
  label,
  onSave,
  className = 'text-foreground font-bold truncate',
  typographyType = 'h6'
}: InlineNameEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(value);
    setEditing(true);
  };

  const save = async () => {
    const name = draft.trim();
    if (!name) {
      return;
    }
    setSaving(true);
    try {
      await onSave(name);
      setEditing(false);
    } catch {
      // caller toasts; stay in edit mode
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <Typography className={className} type={typographyType}>
          {value}
        </Typography>
        <FgTooltip label={`Edit ${label}`}>
          <IconButton
            aria-label={`Edit ${label}`}
            className="text-foreground hover:text-primary flex-shrink-0"
            onClick={startEdit}
            size="sm"
            variant="ghost"
          >
            <FgIcon icon={HiOutlinePencilSquare} />
          </IconButton>
        </FgTooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <FgInput
        autoFocus
        className="min-w-64"
        disabled={saving}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            void save();
          } else if (e.key === 'Escape') {
            setEditing(false);
          }
        }}
        type="text"
        value={draft}
      />
      <FgTooltip label="Save">
        <IconButton
          aria-label={`Save ${label}`}
          className="text-foreground hover:text-primary flex-shrink-0"
          disabled={!draft.trim() || saving}
          onClick={() => void save()}
          size="sm"
          variant="ghost"
        >
          <FgIcon icon={HiOutlineCheck} />
        </IconButton>
      </FgTooltip>
      <FgTooltip label="Cancel">
        <IconButton
          aria-label="Cancel rename"
          className="text-foreground hover:text-primary flex-shrink-0"
          disabled={saving}
          onClick={() => setEditing(false)}
          size="sm"
          variant="ghost"
        >
          <FgIcon icon={HiOutlineX} />
        </IconButton>
      </FgTooltip>
    </div>
  );
}
