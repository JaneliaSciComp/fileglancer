import { Button, ButtonGroup, Typography } from '@material-tailwind/react';
import { Link } from 'react-router';
import type { ChangeEvent } from 'react';

import neuroglancer_logo from '@/assets/neuroglancer.png';
import validator_logo from '@/assets/ome-ngff-validator.png';
import volE_logo from '@/assets/aics_website-3d-cell-viewer.png';
import avivator_logo from '@/assets/vizarr_logo.png';
import copy_logo from '@/assets/copy-link-64.png';
import type { OpenWithToolUrls, PendingToolKey } from '@/hooks/useZarrMetadata';
import { getNeuroglancerUrlAndKey } from '@/hooks/useDataToolLinks';
import FgTooltip from '@/components/ui/widgets/FgTooltip';

export default function DataToolLinks({
  availableVersions,
  onToolClick,
  onVersionChange,
  selectedZarrVersion,
  showCopiedTooltip,
  urls
}: {
  readonly availableVersions?: ('v2' | 'v3')[];
  readonly onToolClick: (toolKey: PendingToolKey) => Promise<void>;
  readonly onVersionChange: (version: 2 | 3) => void;
  readonly selectedZarrVersion: 2 | 3 | null;
  readonly showCopiedTooltip: boolean;
  readonly urls: OpenWithToolUrls | null;
}) {
  const tooltipTriggerClasses =
    'rounded-sm m-0 p-0 transform active:scale-90 transition-transform duration-75';

  if (!urls) {
    return null;
  }

  // Determine which neuroglancer URL and key to use based on selected version and available versions
  const { url: neuroglancerUrl, key: neuroglancerKey } =
    getNeuroglancerUrlAndKey(urls, selectedZarrVersion);

  const hasMultipleVersions = availableVersions && availableVersions.length > 1;

  // Render other tool icons (non-Neuroglancer)
  const otherToolIcons = (
    <>
      {urls.vole !== null ? (
        <FgTooltip
          as={Button}
          label="View in Vol-E"
          triggerClasses={tooltipTriggerClasses}
          variant="ghost"
        >
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
              className="max-h-9 max-w-9 m-1 rounded-sm"
              src={volE_logo}
            />
          </Link>
        </FgTooltip>
      ) : null}

      {urls.avivator !== null ? (
        <FgTooltip
          as={Button}
          label="View in Avivator"
          triggerClasses={tooltipTriggerClasses}
          variant="ghost"
        >
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
              className="max-h-9 max-w-9 m-1 rounded-sm"
              src={avivator_logo}
            />
          </Link>
        </FgTooltip>
      ) : null}

      {urls.validator !== null ? (
        <FgTooltip
          as={Button}
          label="View in OME-Zarr Validator"
          triggerClasses={tooltipTriggerClasses}
          variant="ghost"
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
              className="max-h-9 max-w-9 m-1 rounded-sm"
              src={validator_logo}
            />
          </Link>
        </FgTooltip>
      ) : null}

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
          className="max-h-9 max-w-9 m-1 rounded-sm"
          src={copy_logo}
        />
      </FgTooltip>
    </>
  );

  // If no multiple versions, render all icons in a single row (original layout)
  if (!hasMultipleVersions) {
    return (
      <div className="my-1">
        <Typography className="font-semibold text-sm text-surface-foreground">
          Open with:
        </Typography>
        <ButtonGroup className="relative">
          {neuroglancerUrl !== null ? (
            <FgTooltip
              as={Button}
              label="View in Neuroglancer"
              triggerClasses={tooltipTriggerClasses}
              variant="ghost"
            >
              <Link
                onClick={async e => {
                  e.preventDefault();
                  await onToolClick(neuroglancerKey);
                }}
                rel="noopener noreferrer"
                target="_blank"
                to={neuroglancerUrl}
              >
                <img
                  alt="Neuroglancer logo"
                  className="max-h-9 max-w-9 m-1 rounded-sm"
                  src={neuroglancer_logo}
                />
              </Link>
            </FgTooltip>
          ) : null}
          {otherToolIcons}
        </ButtonGroup>
      </div>
    );
  }

  // If multiple versions exist, render with two rows
  return (
    <div className="flex flex-col gap-4 my-1">
      <Typography className="font-semibold text-sm text-surface-foreground">
        Open with:
      </Typography>

      {/* First row: Neuroglancer icon and version selector */}
      <div className="flex items-center gap-3">
        <ButtonGroup className="relative">
          {neuroglancerUrl !== null ? (
            <FgTooltip
              as={Button}
              label="View in Neuroglancer"
              triggerClasses={tooltipTriggerClasses}
              variant="ghost"
            >
              <Link
                onClick={async e => {
                  e.preventDefault();
                  await onToolClick(neuroglancerKey);
                }}
                rel="noopener noreferrer"
                target="_blank"
                to={neuroglancerUrl}
              >
                <img
                  alt="Neuroglancer logo"
                  className="max-h-9 max-w-9 m-1 rounded-sm"
                  src={neuroglancer_logo}
                />
              </Link>
            </FgTooltip>
          ) : null}
        </ButtonGroup>

        <div
          className="flex flex-col gap-1"
          data-testid="zarr-version-selector-container"
        >
          <Typography className="text-sm font-semibold text-surface-foreground">
            Source:
          </Typography>
          <div className="flex flex-row gap-3">
            {availableVersions.includes('v3') ? (
              <div className="flex items-center gap-1">
                <input
                  checked={selectedZarrVersion === 3}
                  className="icon-small checked:accent-secondary"
                  id="zarr-version-v3"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    if (event.target.checked) {
                      onVersionChange(3);
                    }
                  }}
                  type="radio"
                  value="3"
                />
                <Typography
                  as="label"
                  className="text-foreground text-sm font-semibold"
                  htmlFor="zarr-version-v3"
                >
                  v3
                </Typography>
              </div>
            ) : null}
            {availableVersions.includes('v2') ? (
              <div className="flex items-center gap-1">
                <input
                  checked={selectedZarrVersion === 2}
                  className="icon-small checked:accent-secondary"
                  id="zarr-version-v2"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    if (event.target.checked) {
                      onVersionChange(2);
                    }
                  }}
                  type="radio"
                  value="2"
                />
                <Typography
                  as="label"
                  className="text-foreground text-sm font-semibold"
                  htmlFor="zarr-version-v2"
                >
                  v2
                </Typography>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Second row: Other tool icons */}
      <ButtonGroup className="relative">{otherToolIcons}</ButtonGroup>
    </div>
  );
}
