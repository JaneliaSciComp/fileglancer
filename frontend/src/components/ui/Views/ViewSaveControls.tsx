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
  /** An unsaved draft: it has no saved state to discard back to. */
  readonly draft?: boolean;
};

/** Owner-only Save/Discard controls that sit in the viewer toolbar. */
export default function ViewSaveControls({
  status,
  dirty,
  saving,
  onSave,
  onDiscard,
  draft = false
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
          draft
            ? 'Saving adds this View to your Views list'
            : dirty
              ? 'Saving updates this View for everyone with its link'
              : 'No unsaved changes'
        }
      >
        <FgButton
          color={draft ? 'secondary' : undefined}
          disabled={!dirty}
          loading={saving}
          onClick={onSave}
          size="sm"
        >
          Save
        </FgButton>
      </FgTooltip>
      {draft ? (
        <Typography className="text-foreground/70" variant="small">
          Save to access View later
        </Typography>
      ) : null}
      {dirty && !draft ? (
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
