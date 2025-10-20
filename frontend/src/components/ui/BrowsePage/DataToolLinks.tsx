import React from 'react';
import { Button, ButtonGroup, Typography } from '@material-tailwind/react';
import { Link } from 'react-router';

import neuroglancer_logo from '@/assets/neuroglancer.png';
import validator_logo from '@/assets/ome-ngff-validator.png';
import volE_logo from '@/assets/aics_website-3d-cell-viewer.png';
import avivator_logo from '@/assets/vizarr_logo.png';
import copy_logo from '@/assets/copy-link-64.png';
import type { OpenWithToolUrls, PendingToolKey } from '@/hooks/useZarrMetadata';
import FgTooltip from '@/components/ui/widgets/FgTooltip';

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
}): React.ReactNode {
  const tooltipTriggerClasses =
    'rounded-sm m-0 p-0 transform active:scale-90 transition-transform duration-75';

  if (!urls) {
    return null;
  }

  return (
    <div className="my-1">
      <Typography className="font-semibold text-sm text-surface-foreground">
        {title}
      </Typography>
      <ButtonGroup className="relative">
        {urls.neuroglancer !== null ? (
          <FgTooltip
            as={Button}
            label="View in Neuroglancer"
            triggerClasses={tooltipTriggerClasses}
            variant="ghost"
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
                className="max-h-8 max-w-8 m-1 rounded-sm"
                src={neuroglancer_logo}
              />
            </Link>
          </FgTooltip>
        ) : null}

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
                className="max-h-8 max-w-8 m-1 rounded-sm"
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
                className="max-h-8 max-w-8 m-1 rounded-sm"
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
                className="max-h-8 max-w-8 m-1 rounded-sm"
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
            className="max-h-8 max-w-8 m-1 rounded-sm"
            src={copy_logo}
          />
        </FgTooltip>
      </ButtonGroup>
    </div>
  );
}
