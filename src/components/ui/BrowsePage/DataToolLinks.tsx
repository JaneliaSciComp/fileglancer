import React from 'react';
import { Button, ButtonGroup, Typography } from '@material-tailwind/react';
import { Link } from 'react-router';

import neuroglancer_logo from '@/assets/neuroglancer.png';
import validator_logo from '@/assets/ome-ngff-validator.png';
import volE_logo from '@/assets/aics_website-3d-cell-viewer.png';
import avivator_logo from '@/assets/vizarr_logo.png';
import copy_logo from '@/assets/copy-link-64.png';
import type { OpenWithToolUrls } from '@/hooks/useZarrMetadata';
import { copyToClipboard } from '@/utils/copyText';
import FgTooltip from '../widgets/FgTooltip';

export default function DataToolLinks({
  title,
  urls
}: {
  readonly title: string;
  readonly urls: OpenWithToolUrls;
}): React.ReactNode {
  const [showCopiedTooltip, setShowCopiedTooltip] = React.useState(false);

  const handleCopyUrl = async () => {
    if (urls?.copy) {
      await copyToClipboard(urls.copy);
      setShowCopiedTooltip(true);
      setTimeout(() => {
        setShowCopiedTooltip(false);
      }, 2000);
    }
  };

  const tooltipTriggerClasses =
    'rounded-sm m-0 p-0 transform active:scale-90 transition-transform duration-75';

  return (
    <div className="my-1">
      <Typography className="font-semibold text-sm text-surface-foreground">
        {title}
      </Typography>
      <ButtonGroup className="relative">
        {urls.neuroglancer ? (
          <FgTooltip
            as={Button}
            label="View in Neuroglancer"
            triggerClasses={tooltipTriggerClasses}
            variant="ghost"
          >
            {' '}
            <Link
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

        {urls.vole ? (
          <FgTooltip
            as={Button}
            label="View in Vol-E"
            triggerClasses={tooltipTriggerClasses}
            variant="ghost"
          >
            {' '}
            <Link rel="noopener noreferrer" target="_blank" to={urls.vole}>
              <img
                alt="Vol-E logo"
                className="max-h-8 max-w-8 m-1 rounded-sm"
                src={volE_logo}
              />
            </Link>
          </FgTooltip>
        ) : null}

        {urls.avivator ? (
          <FgTooltip
            as={Button}
            label="View in Avivator"
            triggerClasses={tooltipTriggerClasses}
            variant="ghost"
          >
            {' '}
            <Link rel="noopener noreferrer" target="_blank" to={urls.avivator}>
              <img
                alt="Avivator logo"
                className="max-h-8 max-w-8 m-1 rounded-sm"
                src={avivator_logo}
              />
            </Link>
          </FgTooltip>
        ) : null}

        {urls.validator ? (
          <FgTooltip
            as={Button}
            label="View in OME-Zarr Validator"
            triggerClasses={tooltipTriggerClasses}
            variant="ghost"
          >
            <Link rel="noopener noreferrer" target="_blank" to={urls.validator}>
              <img
                alt="OME-Zarr Validator logo"
                className="max-h-8 max-w-8 m-1 rounded-sm"
                src={validator_logo}
              />
            </Link>
          </FgTooltip>
        ) : null}

        {urls.copy ? (
          <FgTooltip
            as={Button}
            label={showCopiedTooltip ? 'Copied!' : 'Copy data URL'}
            onClick={handleCopyUrl}
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
        ) : null}
      </ButtonGroup>
    </div>
  );
}
