import React from 'react';
import { Button, ButtonGroup, Typography } from '@material-tailwind/react';
import { Link } from 'react-router';

import neuroglancer_logo from '@/assets/neuroglancer.png';
import validator_logo from '@/assets/ome-ngff-validator.png';
import volE_logo from '@/assets/aics_website-3d-cell-viewer.png';
import avivator_logo from '@/assets/vizarr_logo.png';
import copy_logo from '@/assets/copy-link-64.png';
import type { OpenWithToolUrls, PendingToolUrl } from '@/hooks/useZarrMetadata';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';

export default function DataToolLinks({
  title,
  urls,
  setShowDataLinkDialog,
  setPendingToolUrl,
  showCopiedTooltip,
  handleCopyUrl,
  handleCreateDataLink
}: {
  title: string;
  urls: OpenWithToolUrls | null;
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingToolUrl?: React.Dispatch<React.SetStateAction<PendingToolUrl>>;
  showCopiedTooltip: boolean;
  handleCopyUrl: (url: string) => Promise<void>;
  handleCreateDataLink: (
    pendingToolUrl: PendingToolUrl,
    urls: OpenWithToolUrls | null,
    handleCopyUrl: ((url: string) => Promise<void>) | undefined,
    setPendingToolUrl:
      | React.Dispatch<React.SetStateAction<PendingToolUrl>>
      | undefined
  ) => Promise<void>;
}): React.ReactNode {
  const { areDataLinksAutomatic } = usePreferencesContext();
  const { proxiedPath } = useProxiedPathContext();
  const { externalDataUrl } = useExternalBucketContext();

  const handleLinkClick = async (
    url: keyof OpenWithToolUrls,
    event: React.MouseEvent
  ) => {
    if (
      !proxiedPath &&
      !externalDataUrl &&
      !areDataLinksAutomatic &&
      setPendingToolUrl
    ) {
      event.preventDefault();
      setPendingToolUrl(url);
      setShowDataLinkDialog(true);
    } else if (!proxiedPath && !externalDataUrl && areDataLinksAutomatic) {
      event.preventDefault();
      await handleCreateDataLink(url, urls, handleCopyUrl, setPendingToolUrl);
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
              onClick={async e => await handleLinkClick('neuroglancer', e)}
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
            <Link
              to={urls.vole}
              target="_blank"
              rel="noopener noreferrer"
              onClick={async e => await handleLinkClick('vole', e)}
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
            <Link
              to={urls.avivator}
              target="_blank"
              rel="noopener noreferrer"
              onClick={async e => await handleLinkClick('avivator', e)}
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
              onClick={async e => await handleLinkClick('validator', e)}
            >
              <img
                src={validator_logo}
                alt="OME-Zarr Validator logo"
                className="max-h-8 max-w-8 m-1 rounded-sm"
              />
            </Link>
          </FgTooltip>
        ) : null}

        <FgTooltip
          as={Button}
          variant="ghost"
          triggerClasses={tooltipTriggerClasses}
          label={showCopiedTooltip ? 'Copied!' : 'Copy data URL'}
          onClick={async e => {
            if (urls.copy === '') {
              await handleLinkClick('copy', e);
            } else if (urls.copy !== '') {
              await handleCopyUrl(urls.copy);
            }
          }}
          openCondition={showCopiedTooltip ? true : undefined}
        >
          <img
            src={copy_logo}
            alt="Copy URL icon"
            className="max-h-8 max-w-8 m-1 rounded-sm"
          />
        </FgTooltip>
      </ButtonGroup>
    </div>
  );
}
