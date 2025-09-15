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

  const handleCopyUrl = async (event: React.MouseEvent) => {
    if (!proxiedPath && !automaticDataLinks && setPendingNavigationUrl) {
      event.preventDefault();
      setShowDataLinkDialog(true);
    } else {
      if (urls?.copy) {
        await copyToClipboard(urls.copy);
        setShowCopiedTooltip(true);
        setTimeout(() => {
          setShowCopiedTooltip(false);
        }, 2000);
      }
    }
  };

  const handleLinkClick = (url: string | null, event: React.MouseEvent) => {
    if (!proxiedPath && !automaticDataLinks && setPendingNavigationUrl) {
      event.preventDefault();
      setPendingNavigationUrl(url);
      setShowDataLinkDialog(true);
    }
  };

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

        {urls.vole !== null ? (
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

        {urls.avivator !== null ? (
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

        {urls.validator !== null ? (
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

        {urls.copy !== null ? (
          <FgTooltip
            as={Button}
            variant="ghost"
            triggerClasses={tooltipTriggerClasses}
            label={showCopiedTooltip ? 'Copied!' : 'Copy data URL'}
            onClick={e => handleCopyUrl(e)}
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
    </div>
  );
}
