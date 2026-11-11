import { Typography } from '@material-tailwind/react';

import FgButton from '@/components/designSystem/atoms/FgButton';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import type { BridgeStatus } from '@/hooks/useNeuroglancerViewer';

type ViewSaveControlsProps = {
  readonly status: BridgeStatus;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
};

/** Owner-only Save/Discard controls that sit in the viewer toolbar. */
export default function ViewSaveControls({
  status,
  dirty,
  saving,
  onSave,
  onDiscard
}: ViewSaveControlsProps) {
  if (status === 'unavailable') {
    return (
      <Typography className="text-foreground/70" variant="small">
        Editing isn't available with this Neuroglancer deployment
      </Typography>
    );
  }
  return (
    <div className="flex shrink-0 items-center gap-2">
      <FgTooltip
        label={
          dirty
            ? 'Saving updates this View for everyone with its link'
            : 'No unsaved changes'
        }
      >
        <FgButton disabled={!dirty} loading={saving} onClick={onSave} size="sm">
          Save
        </FgButton>
      </FgTooltip>
      {dirty ? (
        <FgButton
          disabled={saving}
          onClick={onDiscard}
          size="sm"
          variant="ghost"
        >
          Discard
        </FgButton>
      ) : null}
    </div>
  );
}
