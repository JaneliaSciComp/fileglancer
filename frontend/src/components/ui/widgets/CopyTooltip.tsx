import { Button } from '@material-tailwind/react';

import FgTooltip from './FgTooltip';
import useCopyTooltip from '@/hooks/useCopyTooltip';

export default function CopyTooltip({
  children,
  primaryLabel,
  textToCopy,
  tooltipTriggerClasses,
  variant = 'ghost'
}: {
  readonly children: React.ReactNode;
  readonly primaryLabel: string;
  readonly textToCopy: string;
  readonly tooltipTriggerClasses?: string;
  readonly variant?: 'outline' | 'ghost';
}) {
  const { showCopiedTooltip, handleCopy } = useCopyTooltip();

  return (
    <FgTooltip
      as={Button}
      label={showCopiedTooltip ? 'Copied!' : primaryLabel}
      onClick={async () => {
        await handleCopy(textToCopy);
      }}
      openCondition={showCopiedTooltip ? true : undefined}
      triggerClasses={tooltipTriggerClasses}
      variant={variant}
    >
      {children}
    </FgTooltip>
  );
}
