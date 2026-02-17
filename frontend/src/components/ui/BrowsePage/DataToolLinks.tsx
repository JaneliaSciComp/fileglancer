import { Typography } from '@material-tailwind/react';
import { Link } from 'react-router';
import { HiOutlineClipboardCopy } from 'react-icons/hi';
import { HiOutlineEllipsisHorizontalCircle } from 'react-icons/hi2';

import neuroglancer_logo from '@/assets/neuroglancer.png';
import validator_logo from '@/assets/ome-ngff-validator.png';
import volE_logo from '@/assets/aics_website-3d-cell-viewer.png';
import avivator_logo from '@/assets/vizarr_logo.png';
import type { OpenWithToolUrls, PendingToolKey } from '@/hooks/useZarrMetadata';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import DialogIconBtn from '@/components/ui/buttons/DialogIconBtn';
import DataLinkUsageDialog from '@/components/ui/Dialogs/DataLinkUsageDialog';
import type { DataLinkType } from '@/components/ui/Dialogs/DataLinkUsageDialog';

const CIRCLE_CLASSES =
  'rounded-full bg-surface-light dark:bg-surface-light hover:bg-surface dark:hover:bg-surface w-12 h-12 flex items-center justify-center cursor-pointer transform active:scale-90 transition-all duration-75';

const LABEL_CLASSES = 'text-xs text-center text-foreground mt-1';

export default function DataToolLinks({
  compact = false,
  dataLinkUrl,
  dataType,
  onToolClick,
  showCopiedTooltip,
  title,
  urls
}: {
  readonly compact?: boolean;
  readonly dataLinkUrl?: string;
  readonly dataType?: DataLinkType;
  readonly onToolClick: (toolKey: PendingToolKey) => Promise<void>;
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
          <div className="flex flex-col items-center w-16">
            <FgTooltip
              label="View in Neuroglancer"
              triggerClasses={CIRCLE_CLASSES}
            >
              <Link
                onClick={async e => {
                  e.preventDefault();
                  await onToolClick('neuroglancer');
                }}
                rel="noopener noreferrer"
                target="_blank"
                to={urls.neuroglancer}
              >
                <img
                  alt="Neuroglancer logo"
                  className="max-h-7 max-w-7 rounded-sm"
                  src={neuroglancer_logo}
                />
              </Link>
            </FgTooltip>
            <span className={LABEL_CLASSES}>Neuroglancer</span>
          </div>
        ) : null}

        {urls.vole !== null ? (
          <div className="flex flex-col items-center w-16">
            <FgTooltip label="View in Vol-E" triggerClasses={CIRCLE_CLASSES}>
              <Link
                onClick={async e => {
                  e.preventDefault();
                  await onToolClick('vole');
                }}
                rel="noopener noreferrer"
                target="_blank"
                to={urls.vole}
              >
                <img
                  alt="Vol-E logo"
                  className="max-h-7 max-w-7 rounded-sm"
                  src={volE_logo}
                />
              </Link>
            </FgTooltip>
            <span className={LABEL_CLASSES}>Vol-E</span>
          </div>
        ) : null}

        {urls.avivator !== null ? (
          <div className="flex flex-col items-center w-16">
            <FgTooltip label="View in Avivator" triggerClasses={CIRCLE_CLASSES}>
              <Link
                onClick={async e => {
                  e.preventDefault();
                  await onToolClick('avivator');
                }}
                rel="noopener noreferrer"
                target="_blank"
                to={urls.avivator}
              >
                <img
                  alt="Avivator logo"
                  className="max-h-7 max-w-7 rounded-sm"
                  src={avivator_logo}
                />
              </Link>
            </FgTooltip>
            <span className={LABEL_CLASSES}>Avivator</span>
          </div>
        ) : null}

        {urls.validator !== null ? (
          <div className="flex flex-col items-center w-16">
            <FgTooltip
              label="View in OME-Zarr Validator"
              triggerClasses={CIRCLE_CLASSES}
            >
              <Link
                onClick={async e => {
                  e.preventDefault();
                  await onToolClick('validator');
                }}
                rel="noopener noreferrer"
                target="_blank"
                to={urls.validator}
              >
                <img
                  alt="OME-Zarr Validator logo"
                  className="max-h-7 max-w-7 rounded-sm"
                  src={validator_logo}
                />
              </Link>
            </FgTooltip>
            <span className={LABEL_CLASSES}>Validator</span>
          </div>
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
            <HiOutlineClipboardCopy className="icon-default text-foreground" />
          </FgTooltip>
          <span className={LABEL_CLASSES}>Copy</span>
        </div>

        {dataLinkUrl && dataType ? (
          <div className="flex flex-col items-center w-16">
            <DialogIconBtn
              icon={HiOutlineEllipsisHorizontalCircle}
              label="More ways to open"
              triggerClasses={CIRCLE_CLASSES}
            >
              {closeDialog => (
                <DataLinkUsageDialog
                  dataLinkUrl={dataLinkUrl}
                  dataType={dataType}
                  onClose={closeDialog}
                  open={true}
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
