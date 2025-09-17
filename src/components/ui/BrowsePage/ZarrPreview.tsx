import React from 'react';
import { Switch, Typography } from '@material-tailwind/react';

import zarrLogo from '@/assets/zarr.jpg';
import ZarrMetadataTable from '@/components/ui/BrowsePage/ZarrMetadataTable';
import DataLinkDialog from '@/components/ui/Dialogs/DataLink';
import DataToolLinks from './DataToolLinks';
import type { OpenWithToolUrls, ZarrMetadata } from '@/hooks/useZarrMetadata';
import useDataLinkDialog from '@/hooks/useDataLinkDialog';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import { Metadata } from '@/omezarr-helper';

type ZarrPreviewProps = {
  readonly thumbnailSrc: string | null;
  readonly loadingThumbnail: boolean;
  readonly openWithToolUrls: OpenWithToolUrls | null;
  readonly metadata: ZarrMetadata;
  readonly thumbnailError: string | null;
  readonly layerType: 'auto' | 'image' | 'segmentation' | null;
};

export default function ZarrPreview({
  thumbnailSrc,
  loadingThumbnail,
  openWithToolUrls,
  metadata,
  thumbnailError,
  layerType
}: ZarrPreviewProps): React.ReactNode {
  const [isImageShared, setIsImageShared] = React.useState(false);
  const { showDataLinkDialog, setShowDataLinkDialog } = useDataLinkDialog();
  const { proxiedPath } = useProxiedPathContext();
  const { externalDataUrl } = useExternalBucketContext();

  React.useEffect(() => {
    setIsImageShared(proxiedPath !== null);
  }, [proxiedPath]);

  return (
    <div className="my-4 p-4 shadow-sm rounded-md bg-primary-light/30">
      <div className="flex gap-12 w-full h-fit max-h-100">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 max-h-full">
            {loadingThumbnail ? (
              <div className="w-72 h-72 animate-pulse bg-surface text-foreground flex">
                <Typography className="place-self-center text-center w-full">
                  Loading thumbnail...
                </Typography>
              </div>
            ) : null}
            {!loadingThumbnail && metadata && thumbnailSrc ? (
              <img
                alt="Thumbnail"
                className="max-h-72 max-w-max rounded-md"
                id="thumbnail"
                src={thumbnailSrc}
              />
            ) : !loadingThumbnail && metadata && !thumbnailSrc ? (
              <div className="p-2">
                <img
                  alt="Zarr logo"
                  className="max-h-44 rounded-md"
                  src={zarrLogo}
                />
                {thumbnailError ? (
                  <Typography className="text-error text-xs pt-3">{`${thumbnailError}`}</Typography>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={externalDataUrl ? true : isImageShared}
              className="mt-2 bg-secondary-light border-secondary-light hover:!bg-secondary-light/80 hover:!border-secondary-light/80"
              disabled={externalDataUrl ? true : false}
              id="share-switch"
              onChange={() => {
                setShowDataLinkDialog(true);
              }}
            />
            <label
              className="-translate-y-0.5 flex flex-col gap-1"
              htmlFor="share-switch"
            >
              <Typography
                as="label"
                className={`${externalDataUrl ? 'cursor-default' : 'cursor-pointer'} text-foreground font-semibold`}
                htmlFor="share-switch"
              >
                Data Link
              </Typography>
              <Typography
                className="text-foreground whitespace-normal max-w-[300px]"
                type="small"
              >
                {externalDataUrl
                  ? 'Public data link already exists since this data is on s3.janelia.org.'
                  : 'Creating a data link for this image allows you to open it in external viewers like Neuroglancer.'}
              </Typography>
            </label>
          </div>

          {showDataLinkDialog ? (
            <DataLinkDialog
              isImageShared={isImageShared}
              proxiedPath={proxiedPath}
              setIsImageShared={setIsImageShared}
              setShowDataLinkDialog={setShowDataLinkDialog}
              showDataLinkDialog={showDataLinkDialog}
            />
          ) : null}

          {openWithToolUrls && (externalDataUrl || isImageShared) ? (
            <DataToolLinks
              title="Open with:"
              urls={openWithToolUrls as OpenWithToolUrls}
            />
          ) : null}
        </div>
        {metadata && 'arr' in metadata ? (
          <ZarrMetadataTable
            layerType={layerType}
            metadata={metadata as Metadata}
          />
        ) : null}
      </div>
    </div>
  );
}
