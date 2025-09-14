import React from 'react';
import { Button, ButtonGroup, Typography } from '@material-tailwind/react';
import { Link } from 'react-router';

import neuroglancer_logo from '@/assets/neuroglancer.png';
import validator_logo from '@/assets/ome-ngff-validator.png';
import volE_logo from '@/assets/aics_website-3d-cell-viewer.png';
import avivator_logo from '@/assets/vizarr_logo.png';
import copy_logo from '@/assets/copy-link-64.png';
import type { OpenWithToolUrls } from '@/hooks/useZarrMetadata';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import { copyToClipboard } from '@/utils/copyText';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';

export default function DataToolLinks({
  title,
  proxiedPath,
  urls,
  setShowDataLinkDialog,
  setPendingNavigationUrl
}: {
  title: string;
  proxiedPath: ProxiedPath | null;
  urls: OpenWithToolUrls | null;
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingNavigationUrl?: React.Dispatch<React.SetStateAction<string | null>>;
}): React.ReactNode {
  const [showCopiedTooltip, setShowCopiedTooltip] = React.useState(false);
  const { automaticDataLinks } = usePreferencesContext();
  const { automaticLinkError } = useProxiedPathContext();

  const handleCopyUrl = async () => {
    if (urls?.copy) {
      await copyToClipboard(urls.copy);
      setShowCopiedTooltip(true);
      setTimeout(() => {
        setShowCopiedTooltip(false);
      }, 2000);
    }
  };

  const handleLinkClick = (url: string, event: React.MouseEvent) => {
    if (automaticLinkError) {
      event.preventDefault();
      return;
    }
    if (
      !proxiedPath &&
      !automaticDataLinks &&
      setPendingNavigationUrl &&
      !automaticLinkError
    ) {
      event.preventDefault();
      setPendingNavigationUrl(url);
      setShowDataLinkDialog(true);
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
        {urls?.neuroglancer !== undefined ? (
          <FgTooltip
            as={Button}
            variant="ghost"
            triggerClasses={tooltipTriggerClasses}
            label="View in Neuroglancer"
          >
            {' '}
            <Link
              to={urls.neuroglancer}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => handleLinkClick(urls.neuroglancer, e)}
            >
              <img
                src={neuroglancer_logo}
                alt="Neuroglancer logo"
                className="max-h-8 max-w-8 m-1 rounded-sm"
              />
            </Link>
          </FgTooltip>
        ) : null}

        {urls?.vole !== undefined ? (
          <FgTooltip
            as={Button}
            variant="ghost"
            triggerClasses={tooltipTriggerClasses}
            label="View in Vol-E"
          >
            {' '}
            <Link
              to={urls.vole}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => handleLinkClick(urls.vole, e)}
            >
              <img
                src={volE_logo}
                alt="Vol-E logo"
                className="max-h-8 max-w-8 m-1 rounded-sm"
              />
            </Link>
          </FgTooltip>
        ) : null}

        {urls?.avivator !== undefined ? (
          <FgTooltip
            as={Button}
            variant="ghost"
            triggerClasses={tooltipTriggerClasses}
            label="View in Avivator"
          >
            {' '}
            <Link
              to={urls.avivator}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => handleLinkClick(urls.avivator, e)}
            >
              <img
                src={avivator_logo}
                alt="Avivator logo"
                className="max-h-8 max-w-8 m-1 rounded-sm"
              />
            </Link>
          </FgTooltip>
        ) : null}

        {urls?.validator !== undefined ? (
          <FgTooltip
            as={Button}
            variant="ghost"
            triggerClasses={tooltipTriggerClasses}
            label="View in OME-Zarr Validator"
          >
            <Link
              to={urls.validator}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => handleLinkClick(urls.validator!, e)}
            >
              <img
                src={validator_logo}
                alt="OME-Zarr Validator logo"
                className="max-h-8 max-w-8 m-1 rounded-sm"
              />
            </Link>
          </FgTooltip>
        ) : null}

        {urls?.copy !== undefined ? (
          <FgTooltip
            as={Button}
            variant="ghost"
            triggerClasses={tooltipTriggerClasses}
            label={showCopiedTooltip ? 'Copied!' : 'Copy data URL'}
            onClick={handleCopyUrl}
            openCondition={showCopiedTooltip ? true : undefined}
          >
            <img
              src={copy_logo}
              alt="Copy URL icon"
              className="max-h-8 max-w-8 m-1 rounded-sm"
            />
          </FgTooltip>
        ) : null}
      </ButtonGroup>
      {automaticLinkError ? (
        <Typography className="text-error text-xs pt-3">{`${automaticLinkError}`}</Typography>
      ) : null}
    </div>
  );
}
