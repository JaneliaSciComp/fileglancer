import { Typography } from '@material-tailwind/react';

import FgButton from '@/components/designSystem/atoms/FgButton';
import type { BridgeStatus } from '@/hooks/useNeuroglancerViewer';

type ViewSaveBarProps = {
  readonly status: BridgeStatus;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
};

/** Owner-only strip under the viewer toolbar: Save/Discard, or why not. */
export default function ViewSaveBar({
  status,
  dirty,
  saving,
  onSave,
  onDiscard
}: ViewSaveBarProps) {
  if (status === 'unavailable') {
    return (
      <div className="shrink-0 border-b border-surface px-4 py-1">
        <Typography className="text-foreground/70" variant="small">
          Editing isn't available with this Neuroglancer deployment
        </Typography>
      </div>
    );
  }
  if (!dirty) {
    return null;
  }
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-warning bg-warning/10 px-4 py-1">
      <Typography className="text-foreground" variant="small">
        Unsaved changes — saving updates this View for everyone with its link.
      </Typography>
      <div className="flex shrink-0 items-center gap-2">
        <FgButton
          disabled={saving}
          onClick={onDiscard}
          size="sm"
          variant="ghost"
        >
          Discard
        </FgButton>
        <FgButton loading={saving} onClick={onSave} size="sm">
          Save
        </FgButton>
      </div>
    </div>
  );
}
