import React from 'react';
import {
  Button,
  ButtonGroup,
  Switch,
  Typography,
  Tooltip
} from '@material-tailwind/react';
import { Link } from 'react-router-dom';

import zarr from '@/assets/zarr.jpg';
import neuroglancer_logo from '@/assets/neuroglancer.png';
import validator_logo from '@/assets/ome-ngff-validator.png';
import volE_logo from '@/assets/aics_website-3d-cell-viewer.png';
import copy_logo from '@/assets/copy-link-64.png';

import ZarrMetadataTable from '@/components/ui/FileBrowser/ZarrMetadataTable';
import SharingDialog from '@/components/ui/Dialogs/Sharing';
import Loader from '@/components/ui/Loader';
import type { OpenWithToolUrls, ZarrMetadata } from '@/hooks/useZarrMetadata';
import useSharingDialog from '@/hooks/useSharingDialog';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { Metadata } from '@/omezarr-helper';

type ZarrPreviewProps = {
  thumbnailSrc: string | null;
  loadingThumbnail: boolean;
  openWithToolUrls: OpenWithToolUrls | null;
  metadata: ZarrMetadata;
  thumbnailError: string | null;
};

export default function ZarrPreview({
  thumbnailSrc,
  loadingThumbnail,
  openWithToolUrls,
  metadata,
  thumbnailError
}: ZarrPreviewProps): React.ReactNode {
  const [isImageShared, setIsImageShared] = React.useState(false);
  const [showCopiedTooltip, setShowCopiedTooltip] = React.useState(false);

  const { showSharingDialog, setShowSharingDialog } = useSharingDialog();
  const { proxiedPath } = useProxiedPathContext();
  const { currentFolder } = useFileBrowserContext();

  React.useEffect(() => {
    setIsImageShared(proxiedPath !== null);
  }, [proxiedPath]);

  const handleCopyUrl = async () => {
    if (openWithToolUrls?.copy) {
      await copyToClipboard(openWithToolUrls.copy);
      setShowCopiedTooltip(true);
      setTimeout(() => {
        setShowCopiedTooltip(false);
      }, 1000);
    }
  };

  return (
    <div className="my-4 p-4 shadow-sm rounded-md bg-primary-light/30">
      <div className="flex gap-12 w-full h-fit max-h-100">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 max-h-full">
            {loadingThumbnail ? (
              <>
                <Typography className="text-surface-foreground">
                  Loading OME-Zarr image thumbnail...
                </Typography>
                <Loader />
              </>
            ) : null}
            {!loadingThumbnail && metadata && thumbnailSrc ? (
              <img
                id="thumbnail"
                src={thumbnailSrc}
                alt="Thumbnail"
                className="max-h-72 max-w-max rounded-md"
              />
            ) : !loadingThumbnail && metadata && !thumbnailSrc ? (
              <div className="p-2">
                <img
                  src={zarr}
                  alt="Zarr logo"
                  className="max-h-44 rounded-md"
                />
                {thumbnailError ? (
                  <Typography className="text-error text-xs pt-3">{`${thumbnailError}`}</Typography>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="share-switch"
              className="mt-2 bg-secondary-light border-secondary-light hover:!bg-secondary-light/80 hover:!border-secondary-light/80"
              onChange={() => {
                setShowSharingDialog(true);
              }}
              checked={isImageShared}
            />
            <label
              htmlFor="share-switch"
              className="-translate-y-0.5 flex flex-col gap-1"
            >
              <Typography
                as="label"
                htmlFor="share-switch"
                className="cursor-pointer text-foreground font-semibold"
              >
                Share Image
              </Typography>
              <Typography type="small" className="text-foreground">
                Share to view images in external viewers like Neuroglancer.
              </Typography>
            </label>
          </div>

          {showSharingDialog ? (
            <SharingDialog
              isImageShared={isImageShared}
              setIsImageShared={setIsImageShared}
              filePathWithoutFsp={currentFolder?.path || ''}
              showSharingDialog={showSharingDialog}
              setShowSharingDialog={setShowSharingDialog}
              proxiedPath={proxiedPath}
            />
          ) : null}

          {openWithToolUrls && isImageShared ? (
            <div>
              <Typography className="font-semibold text-sm text-surface-foreground">
                Open with:
              </Typography>
              <ButtonGroup className="relative">
                {openWithToolUrls.validator ? (
                  <Tooltip placement="top">
                    <Tooltip.Trigger
                      as={Button}
                      variant="ghost"
                      className="rounded-sm m-0 p-0 transform active:scale-90 transition-transform duration-75"
                    >
                      <Link
                        to={openWithToolUrls.validator}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={validator_logo}
                          alt="OME-Zarr Validator logo"
                          className="max-h-8 max-w-8 m-1 rounded-sm"
                        />
                      </Link>
                      <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
                        <Typography type="small" className="opacity-90">
                          View in OME-Zarr Validator
                        </Typography>
                        <Tooltip.Arrow />
                      </Tooltip.Content>
                    </Tooltip.Trigger>
                  </Tooltip>
                ) : null}

                {openWithToolUrls.neuroglancer ? (
                  <Tooltip placement="top">
                    <Tooltip.Trigger
                      as={Button}
                      variant="ghost"
                      className="rounded-sm m-0 p-0 transform active:scale-90 transition-transform duration-75"
                    >
                      <Link
                        to={openWithToolUrls.neuroglancer}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={neuroglancer_logo}
                          alt="Neuroglancer logo"
                          className="max-h-8 max-w-8 m-1 rounded-sm"
                        />
                      </Link>
                      <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
                        <Typography type="small" className="opacity-90">
                          View in Neuroglancer
                        </Typography>
                        <Tooltip.Arrow />
                      </Tooltip.Content>
                    </Tooltip.Trigger>
                  </Tooltip>
                ) : null}

                {openWithToolUrls.vole ? (
                  <Tooltip placement="top">
                    <Tooltip.Trigger
                      as={Button}
                      variant="ghost"
                      className="rounded-sm m-0 p-0 transform active:scale-90 transition-transform duration-75"
                    >
                      <Link
                        to={openWithToolUrls.vole}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={volE_logo}
                          alt="Vol-E logo"
                          className="max-h-8 max-w-8 m-1 rounded-sm"
                        />
                      </Link>
                      <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
                        <Typography type="small" className="opacity-90">
                          View in Vol-E
                        </Typography>
                        <Tooltip.Arrow />
                      </Tooltip.Content>
                    </Tooltip.Trigger>
                  </Tooltip>
                ) : null}

                {openWithToolUrls.copy ? (
                  <Tooltip
                    placement="top"
                    open={showCopiedTooltip ? true : undefined}
                  >
                    <Tooltip.Trigger
                      as={Button}
                      variant="ghost"
                      className="rounded-sm m-0 p-0 transform active:scale-90 transition-transform duration-75"
                      onClick={handleCopyUrl}
                    >
                      <img
                        src={copy_logo}
                        alt="Copy URL icon"
                        className="max-h-8 max-w-8 m-1 rounded-sm"
                      />
                      <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
                        <Typography type="small" className="opacity-90">
                          {showCopiedTooltip ? 'Copied!' : 'Copy data URL'}
                        </Typography>
                        <Tooltip.Arrow />
                      </Tooltip.Content>
                    </Tooltip.Trigger>
                  </Tooltip>
                ) : null}
              </ButtonGroup>
            </div>
          ) : null}
        </div>
        {metadata && 'arr' in metadata && (
          <ZarrMetadataTable metadata={metadata as Metadata} />
        )}
      </div>
    </div>
  );
}
