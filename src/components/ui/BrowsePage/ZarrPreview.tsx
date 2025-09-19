import React from 'react';
import { Typography } from '@material-tailwind/react';

import zarrLogo from '@/assets/zarr.jpg';
import ZarrMetadataTable from '@/components/ui/BrowsePage/ZarrMetadataTable';
import DataLinkDialog from '@/components/ui/Dialogs/DataLink';
import DataToolLinks from './DataToolLinks';
import type {
  OpenWithToolUrls,
  ZarrMetadata,
  PendingToolUrl
} from '@/hooks/useZarrMetadata';
import useDataToolLinks from '@/hooks/useDataToolLinks';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useExternalBucketContext } from '@/contexts/ExternalBucketContext';
import { Metadata } from '@/omezarr-helper';
import useCopiedTooltip from '@/hooks/useCopiedTooltip';

type ZarrPreviewProps = {
  thumbnailSrc: string | null;
  loadingThumbnail: boolean;
  openWithToolUrls: OpenWithToolUrls | null;
  metadata: ZarrMetadata;
  thumbnailError: string | null;
  layerType: 'auto' | 'image' | 'segmentation' | null;
};

export default function ZarrPreview({
  thumbnailSrc,
  loadingThumbnail,
  openWithToolUrls,
  metadata,
  thumbnailError,
  layerType
}: ZarrPreviewProps): React.ReactNode {
  const [pendingToolUrl, setPendingToolUrl] =
    React.useState<PendingToolUrl>(null);
  const {
    showDataLinkDialog,
    setShowDataLinkDialog,
    handleCreateDataLink,
    handleDeleteDataLink
  } = useDataToolLinks();
  const { proxiedPath } = useProxiedPathContext();
  const { externalDataUrl } = useExternalBucketContext();
  const { showCopiedTooltip, handleCopyUrl } = useCopiedTooltip();

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
                id="thumbnail"
                src={thumbnailSrc}
                alt="Thumbnail"
                className="max-h-72 max-w-max rounded-md"
              />
            ) : !loadingThumbnail && metadata && !thumbnailSrc ? (
              <div className="p-2">
                <img
                  src={zarrLogo}
                  alt="Zarr logo"
                  className="max-h-44 rounded-md"
                />
                {thumbnailError ? (
                  <Typography className="text-error text-xs pt-3">{`${thumbnailError}`}</Typography>
                ) : null}
              </div>
            ) : null}
          </div>

          {openWithToolUrls || externalDataUrl ? (
            <DataToolLinks
              title="Open with:"
              urls={openWithToolUrls as OpenWithToolUrls}
              setShowDataLinkDialog={setShowDataLinkDialog}
              setPendingToolUrl={setPendingToolUrl}
              showCopiedTooltip={showCopiedTooltip}
              handleCopyUrl={handleCopyUrl}
              handleCreateDataLink={handleCreateDataLink}
            />
          ) : null}

          {showDataLinkDialog ? (
            <DataLinkDialog
              action="create"
              showDataLinkDialog={showDataLinkDialog}
              setShowDataLinkDialog={setShowDataLinkDialog}
              proxiedPath={proxiedPath}
              urls={openWithToolUrls as OpenWithToolUrls}
              pendingToolUrl={pendingToolUrl}
              setPendingToolUrl={setPendingToolUrl}
              handleCopyUrl={handleCopyUrl}
              handleCreateDataLink={handleCreateDataLink}
              handleDeleteDataLink={handleDeleteDataLink}
            />
          ) : null}
        </div>
        {metadata && 'arr' in metadata && (
          <ZarrMetadataTable
            metadata={metadata as Metadata}
            layerType={layerType}
          />
        )}
      </div>
    </div>
  );
}
