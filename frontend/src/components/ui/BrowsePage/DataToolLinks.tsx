import { Typography } from '@material-tailwind/react';
import { Link } from 'react-router';
import { HiOutlineClipboardCopy } from 'react-icons/hi';
import { HiOutlineEllipsisHorizontalCircle } from 'react-icons/hi2';

import neuroglancer_logo from '@/assets/neuroglancer.png';
import validator_logo from '@/assets/ome-ngff-validator.png';
import volE_logo from '@/assets/aics_website-3d-cell-viewer.png';
import avivator_logo from '@/assets/vizarr_logo.png';
import type { OpenWithToolUrls, PendingToolKey } from '@/hooks/useZarrMetadata';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import DialogIconBtn from '@/components/ui/buttons/DialogIconBtn';
import DataLinkUsageDialog from '@/components/ui/Dialogs/dataLinkUsage/DataLinkUsageDialog';

const CIRCLE_CLASSES =
  'rounded-full bg-surface-light dark:bg-primary/15 hover:bg-surface dark:hover:bg-primary/25 w-12 h-12 flex items-center justify-center cursor-pointer transform active:scale-90 transition-all duration-75';

const LABEL_CLASSES = 'text-xs text-center text-foreground mt-1';

function ToolLink({
  url,
  label,
  tooltipLabel,
  logoSrc,
  logoAlt,
  toolKey,
  onToolClick
}: {
  readonly url: string;
  readonly label: string;
  readonly tooltipLabel: string;
  readonly logoSrc: string;
  readonly logoAlt: string;
  readonly toolKey: PendingToolKey;
  readonly onToolClick: (toolKey: PendingToolKey) => Promise<void>;
}) {
  return (
    <div className="flex flex-col items-center w-16">
      <FgTooltip label={tooltipLabel} triggerClasses={CIRCLE_CLASSES}>
        <Link
          onClick={async e => {
            e.preventDefault();
            await onToolClick(toolKey);
          }}
          rel="noopener noreferrer"
          target="_blank"
          to={url}
        >
          <img
            alt={logoAlt}
            className="max-h-7 max-w-7 rounded-sm"
            src={logoSrc}
          />
        </Link>
      </FgTooltip>
      <span className={LABEL_CLASSES}>{label}</span>
    </div>
  );
}

export default function DataToolLinks({
  compact = false,
  dataLinkUrl,
  fspName,
  onToolClick,
  path,
  showCopiedTooltip,
  title,
  urls
}: {
  readonly compact?: boolean;
  readonly dataLinkUrl?: string;
  readonly fspName?: string;
  readonly onToolClick: (toolKey: PendingToolKey) => Promise<void>;
  readonly path?: string;
  readonly showCopiedTooltip: boolean;
  readonly title: string;
  readonly urls: OpenWithToolUrls | null;
}) {
  if (!urls) {
    return null;
  }

  return (
    <div className="my-1" data-tour="data-tool-links">
      <Typography className="font-semibold text-sm text-surface-foreground mb-1">
        {title}
      </Typography>
      <div
        className={`flex flex-wrap gap-2 items-start ${compact ? 'max-w-[13.5rem]' : ''}`}
      >
        {urls.neuroglancer !== null ? (
          <ToolLink
            label="Neuroglancer"
            logoAlt="Neuroglancer logo"
            logoSrc={neuroglancer_logo}
            onToolClick={onToolClick}
            toolKey="neuroglancer"
            tooltipLabel="View in Neuroglancer"
            url={urls.neuroglancer}
          />
        ) : null}

        {urls.vole !== null ? (
          <ToolLink
            label="Vol-E"
            logoAlt="Vol-E logo"
            logoSrc={volE_logo}
            onToolClick={onToolClick}
            toolKey="vole"
            tooltipLabel="View in Vol-E"
            url={urls.vole}
          />
        ) : null}

        {urls.avivator !== null ? (
          <ToolLink
            label="Avivator"
            logoAlt="Avivator logo"
            logoSrc={avivator_logo}
            onToolClick={onToolClick}
            toolKey="avivator"
            tooltipLabel="View in Avivator"
            url={urls.avivator}
          />
        ) : null}

        {urls.validator !== null ? (
          <ToolLink
            label="Validator"
            logoAlt="OME-Zarr Validator logo"
            logoSrc={validator_logo}
            onToolClick={onToolClick}
            toolKey="validator"
            tooltipLabel="View in OME-Zarr Validator"
            url={urls.validator}
          />
        ) : null}

        <div className="flex flex-col items-center w-16">
          <FgTooltip
            as="button"
            label={showCopiedTooltip ? 'Copied!' : 'Copy data URL'}
            onClick={async () => {
              await onToolClick('copy');
            }}
            openCondition={showCopiedTooltip ? true : undefined}
            triggerClasses={CIRCLE_CLASSES}
          >
            <FgIcon className="text-foreground" icon={HiOutlineClipboardCopy} />
          </FgTooltip>
          <span className={LABEL_CLASSES}>Copy</span>
        </div>

        {dataLinkUrl && fspName && path ? (
          <div className="flex flex-col items-center w-16">
            <DialogIconBtn
              icon={HiOutlineEllipsisHorizontalCircle}
              label="More ways to open"
              triggerClasses={CIRCLE_CLASSES}
            >
              {closeDialog => (
                <DataLinkUsageDialog
                  dataLinkUrl={dataLinkUrl}
                  fspName={fspName}
                  onClose={closeDialog}
                  open={true}
                  path={path}
                />
              )}
            </DialogIconBtn>
            <span className={LABEL_CLASSES}>More...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
