import { useState } from 'react';
import { Typography } from '@material-tailwind/react';
import type { UseQueryResult } from '@tanstack/react-query';

import zarrLogo from '@/assets/zarr.jpg';
import ZarrMetadataTable from '@/components/ui/BrowsePage/ZarrMetadataTable';
import DataLinkDialog from '@/components/ui/Dialogs/DataLink';
import DataToolLinks from './DataToolLinks';
import type {
  OpenWithToolUrls,
  ZarrMetadata,
  PendingToolKey
} from '@/hooks/useZarrMetadata';
import useDataToolLinks from '@/hooks/useDataToolLinks';
import { Metadata } from '@/omezarr-helper';

type ZarrPreviewProps = {
  readonly availableVersions: ('v2' | 'v3')[];
  readonly thumbnailQuery: UseQueryResult<string, Error>;
  readonly openWithToolUrls: OpenWithToolUrls | null;
  readonly zarrMetadataQuery: UseQueryResult<{
    metadata: ZarrMetadata;
    omeZarrUrl: string | null;
  }>;
  readonly layerType: 'auto' | 'image' | 'segmentation' | null;
};

export default function ZarrPreview({
  availableVersions,
  thumbnailQuery,
  openWithToolUrls,
  zarrMetadataQuery,
  layerType
}: ZarrPreviewProps) {
  const [showDataLinkDialog, setShowDataLinkDialog] = useState<boolean>(false);
  const [pendingToolKey, setPendingToolKey] = useState<PendingToolKey>(null);

  const {
    handleToolClick,
    handleDialogConfirm,
    handleDialogCancel,
    showCopiedTooltip
  } = useDataToolLinks(
    setShowDataLinkDialog,
    openWithToolUrls,
    pendingToolKey,
    setPendingToolKey
  );

  return (
    <div className="my-4 p-4 shadow-sm rounded-md bg-primary-light/30">
      <div className="flex gap-12 w-full h-fit">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 max-h-full">
            {!zarrMetadataQuery.data?.omeZarrUrl ? (
              <div className="p-2">
                <img
                  alt="Zarr logo"
                  className="max-h-44 rounded-md"
                  src={zarrLogo}
                />
              </div>
            ) : zarrMetadataQuery.data?.omeZarrUrl &&
              thumbnailQuery.isPending ? (
              <div className="w-72 h-72 animate-pulse bg-surface text-foreground flex">
                <Typography className="place-self-center text-center w-full">
                  Loading thumbnail...
                </Typography>
              </div>
            ) : thumbnailQuery.isError ? (
              <div className="p-2">
                <img
                  alt="Zarr logo"
                  className="max-h-44 rounded-md"
                  src={zarrLogo}
                />
                <Typography className="text-error text-xs pt-3">
                  {thumbnailQuery.error.message}
                </Typography>
              </div>
            ) : !thumbnailQuery.isPending && thumbnailQuery.data ? (
              <img
                alt="Thumbnail"
                className="max-h-72 max-w-max rounded-md"
                id="thumbnail"
                src={thumbnailQuery.data}
              />
            ) : null}
          </div>

          {openWithToolUrls ? (
            <DataToolLinks
              onToolClick={handleToolClick}
              showCopiedTooltip={showCopiedTooltip}
              title="Open with:"
              urls={openWithToolUrls as OpenWithToolUrls}
            />
          ) : null}

          {showDataLinkDialog ? (
            <DataLinkDialog
              action="create"
              onCancel={handleDialogCancel}
              onConfirm={handleDialogConfirm}
              setPendingToolKey={setPendingToolKey}
              setShowDataLinkDialog={setShowDataLinkDialog}
              showDataLinkDialog={showDataLinkDialog}
              tools={true}
            />
          ) : null}
        </div>
        {zarrMetadataQuery.data?.metadata &&
        'arr' in zarrMetadataQuery.data.metadata ? (
          <ZarrMetadataTable
            availableVersions={availableVersions}
            layerType={layerType}
            metadata={zarrMetadataQuery.data.metadata as Metadata}
          />
        ) : null}
      </div>
    </div>
  );
}
