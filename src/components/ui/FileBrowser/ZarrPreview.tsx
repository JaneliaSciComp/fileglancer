import React from 'react';
import {
  Button,
  ButtonGroup,
  Switch,
  Typography,
  Tooltip
} from '@material-tailwind/react';
import { Link } from 'react-router-dom';

import neuroglancer_logo from '@/assets/neuroglancer.png';
import validator_logo from '@/assets/ome-ngff-validator.png';
import volE_logo from '@/assets/aics_website-3d-cell-viewer.png';
import copy_logo from '@/assets/copy-link-64.png';
// import napari_logo from '@/assets/napari.png';

import useCopyPath from '@/hooks/useCopyPath';
import type { Metadata } from '@/omezarr-helper';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import ZarrMetadataTable from './ZarrMetadataTable';
import SharingDialog from '../Dialogs/SharingDialog';
import type { OpenWithToolUrls } from '@/hooks/useZarrMetadata';

type ZarrPreviewProps = {
  thumbnailSrc: string | null;
  loadingThumbnail: boolean;
  openWithToolUrls: OpenWithToolUrls | null;
  metadata: Metadata | null;
};

export default function ZarrPreview({
  thumbnailSrc,
  loadingThumbnail,
  openWithToolUrls,
  metadata
}: ZarrPreviewProps): React.ReactNode {
  const [showSharingDialog, setShowSharingDialog] =
    React.useState<boolean>(false);
  const [isImageShared, setIsImageShared] = React.useState(false);
  const [showCopiedTooltip, setShowCopiedTooltip] = React.useState(false);

  const { copyToClipboard } = useCopyPath();
  const { proxiedPath } = useProxiedPathContext();
  const { currentFileOrFolder } = useFileBrowserContext();

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
                <Typography variant="small" className="text-surface-foreground">
                  Loading OME-Zarr image thumbnail...
                </Typography>
                <div
                  className="w-10 h-10 border-4 border-surface-foreground border-t-transparent rounded-full animate-spin"
                  title="Loading Thumbnail..."
                ></div>
              </>
            ) : null}
            {!loadingThumbnail && thumbnailSrc ? (
              <img
                id="thumbnail"
                src={thumbnailSrc}
                alt="Thumbnail"
                className="max-h-72 max-w-max rounded-md"
              />
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="share-switch"
              className="mt-2 bg-secondary-light border-secondary-light hover:!bg-secondary-light/80 hover:!border-secondary-light/80"
              onClick={() => {
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
              filePathWithoutFsp={currentFileOrFolder?.path || ''}
              showSharingDialog={showSharingDialog}
              setShowSharingDialog={setShowSharingDialog}
            />
          ) : null}

          {openWithToolUrls && isImageShared ? (
            <div>
              <Typography className="font-semibold text-sm text-surface-foreground">
                Open with:
              </Typography>
              <ButtonGroup className="relative">
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

                {/* <div>
                  <Button
                    title="Copy link to view in Napari"
                    variant="ghost"
                    className="group peer/napari rounded-sm m-0 p-0 relative"
                    onClick={() => {
                      copyToClipboard('Napari URL');
                    }}
                  >
                    <img
                      src={napari_logo}
                      alt="Napari logo"
                      className="max-h-8 max-w-8 m-1 rounded-sm"
                    />
                    <Square2StackIcon className="w-4 h-4 text-transparent group-hover:text-foreground absolute top-0 right-0 bg-transparent group-hover:bg-background" />
                  </Button>
                  <Typography
                    className={`!hidden text-transparent
                    ${showCopyAlert !== true && 'peer-hover/napari:text-foreground peer-hover/napari:bg-background peer-hover/napari:!block'}
                    absolute top-12 left-0 bg-transparent w-fit px-1 rounded-sm`}
                  >
                    See <a href="https://napari.org">napari.org</a> for
                    instructions. Then <code>napari URL</code>
                  </Typography>
                </div> */}
              </ButtonGroup>
            </div>
          ) : null}
        </div>
        {metadata && <ZarrMetadataTable metadata={metadata} />}
      </div>
    </div>
  );
}
