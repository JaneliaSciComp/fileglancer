import { Button, ButtonGroup, Typography } from '@material-tailwind/react';
import { Link } from 'react-router';
import copy_logo from '@/assets/copy-link-64.png';
import type {
  OpenWithToolUrls,
  PendingToolKey
} from '@/hooks/useZarrMetadata';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import { useViewersContext } from '@/contexts/ViewersContext';

export default function DataToolLinks({
  onToolClick,
  showCopiedTooltip,
  title,
  urls
}: {
  readonly onToolClick: (toolKey: PendingToolKey) => Promise<void>;
  readonly showCopiedTooltip: boolean;
  readonly title: string;
  readonly urls: OpenWithToolUrls | null;
}) {
  const { validViewers } = useViewersContext();

  const tooltipTriggerClasses =
    'rounded-sm m-0 p-0 transform active:scale-90 transition-transform duration-75';

  if (!urls) {
    return null;
  }

  return (
    <div className="my-1" data-tour="data-tool-links">
      <Typography className="font-semibold text-sm text-surface-foreground">
        {title}
      </Typography>
      <ButtonGroup className="relative">
        {validViewers.map(viewer => {
          const url = urls[viewer.key];

          // null means incompatible, don't show
          if (url === null) {
            return null;
          }

          return (
            <FgTooltip
              key={viewer.key}
              as={Button}
              label={viewer.label}
              triggerClasses={tooltipTriggerClasses}
              variant="ghost"
            >
              <Link
                onClick={async e => {
                  e.preventDefault();
                  await onToolClick(viewer.key as PendingToolKey);
                }}
                rel="noopener noreferrer"
                target="_blank"
                to={url}
              >
                <img
                  alt={viewer.label}
                  className="max-h-8 max-w-8 m-1 rounded-sm"
                  src={viewer.logoPath}
                />
              </Link>
            </FgTooltip>
          );
        })}

        {/* Copy URL tool - always available when there's a data URL */}
        <FgTooltip
          as={Button}
          label={showCopiedTooltip ? 'Copied!' : 'Copy data URL'}
          onClick={async () => {
            await onToolClick('copy');
          }}
          openCondition={showCopiedTooltip ? true : undefined}
          triggerClasses={tooltipTriggerClasses}
          variant="ghost"
        >
          <img
            alt="Copy URL icon"
            className="max-h-8 max-w-8 m-1 rounded-sm"
            src={copy_logo}
          />
        </FgTooltip>
      </ButtonGroup>
    </div>
  );
}
