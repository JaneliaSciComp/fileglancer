import { useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import N5MetadataTable from '@/components/ui/BrowsePage/N5MetadataTable';
import DataLinkDialog from '@/components/ui/Dialogs/DataLink';
import DataToolLinks from './DataToolLinks';
import type { N5Metadata, N5OpenWithToolUrls } from '@/queries/n5Queries';
import useDataToolLinks from '@/hooks/useDataToolLinks';
import type { OpenWithToolUrls, PendingToolKey } from '@/hooks/useZarrMetadata';

type N5PreviewProps = {
  readonly mainPanelWidth: number;
  readonly openWithToolUrls: N5OpenWithToolUrls | null;
  readonly n5MetadataQuery: UseQueryResult<N5Metadata | null, Error>;
};

/**
 * N5 Logo placeholder component
 */
function N5Logo() {
  return (
    <div className="p-2">
      <div className="max-h-44 w-44 rounded-md bg-surface flex items-center justify-center">
        <span className="text-4xl font-bold text-foreground/70">N5</span>
      </div>
    </div>
  );
}

export default function N5Preview({
  mainPanelWidth,
  openWithToolUrls,
  n5MetadataQuery
}: N5PreviewProps) {
  const [showDataLinkDialog, setShowDataLinkDialog] = useState<boolean>(false);
  const [pendingToolKey, setPendingToolKey] = useState<PendingToolKey>(null);

  const {
    handleToolClick,
    handleDialogConfirm,
    handleDialogCancel,
    showCopiedTooltip
  } = useDataToolLinks(
    setShowDataLinkDialog,
    openWithToolUrls as OpenWithToolUrls | null,
    pendingToolKey,
    setPendingToolKey
  );

  return (
    <div className="min-w-full p-4 shadow-sm rounded-md bg-primary-light/30">
      <div className="flex gap-12 w-full h-fit">
        <div className="flex flex-col gap-4">
          <N5Logo />

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
        {n5MetadataQuery.data ? (
          <div
            className={`flex ${mainPanelWidth > 1000 ? 'gap-6' : 'flex-col gap-4'} h-fit`}
          >
            <N5MetadataTable metadata={n5MetadataQuery.data} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
