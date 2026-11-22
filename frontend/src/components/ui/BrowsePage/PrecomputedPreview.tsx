import { useState } from 'react';
import toast from 'react-hot-toast';
import { useOutletContext } from 'react-router';

import PrecomputedMetadataTable from '@/components/ui/BrowsePage/PrecomputedMetadataTable';
import DataLinkDialog from '@/components/ui/Dialogs/DataLink';
import DataToolLinks from './DataToolLinks';
import useDataToolLinks from '@/hooks/useDataToolLinks';
import { useCreateViewFlow } from '@/hooks/useCreateViewFlow';
import { useCartContext } from '@/contexts/CartContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import type { OpenWithToolUrls, PendingToolKey } from '@/hooks/useZarrMetadata';
import type { OutletContextType } from '@/layouts/BrowseLayout';
import type { PrecomputedInfo } from '@/utils/precomputed';

type PrecomputedPreviewProps = {
  readonly fspName: string;
  readonly mainPanelWidth: number;
  readonly openWithToolUrls: OpenWithToolUrls | null;
  readonly path: string;
  readonly precomputed: PrecomputedInfo;
};

export default function PrecomputedPreview({
  fspName,
  mainPanelWidth,
  openWithToolUrls,
  path,
  precomputed
}: PrecomputedPreviewProps) {
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

  const { addToCart } = useCartContext();
  const { neuroglancerButtonTarget } = usePreferencesContext();
  const { startDraftView, dialog: createViewDialog } = useCreateViewFlow();
  // ponytail: optional — component tests render without a router outlet.
  const outlet = useOutletContext<OutletContextType | null | undefined>();

  const datasetLabel = path.split('/').filter(Boolean).pop() || path;
  const handleAddToCart = async () => {
    try {
      await addToCart([{ fsp_name: fspName, path, label: datasetLabel }]);
      toast.success(`Added "${datasetLabel}" to the cart`);
      outlet?.openDrawer('cart');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(
        `Error adding "${datasetLabel}" to the cart: ${errorMessage}`
      );
    }
  };

  return (
    <div className="min-w-full p-4 shadow-sm rounded-md bg-primary-light/30">
      <div className="flex gap-12 w-full h-fit">
        <div className="flex flex-col gap-4">
          {/* ponytail: text placeholder, not a thumbnail. Rendering one needs
              the precomputed chunk decoders; add if a preview image matters. */}
          <div className="p-2">
            <div className="h-44 w-44 rounded-md bg-surface flex flex-col items-center justify-center text-foreground/70">
              <span className="text-sm font-semibold">Neuroglancer</span>
              <span className="text-2xl font-bold">Precomputed</span>
            </div>
          </div>

          <DataToolLinks
            compact={mainPanelWidth <= 1000}
            dataLinkUrl={openWithToolUrls?.copy || undefined}
            fspName={fspName}
            onAddToCart={() => void handleAddToCart()}
            onOpenNeuroglancer={
              neuroglancerButtonTarget === 'views'
                ? () =>
                    startDraftView(
                      [{ fsp_name: fspName, path, label: datasetLabel }],
                      datasetLabel
                    )
                : undefined
            }
            onToolClick={handleToolClick}
            path={path}
            showCopiedTooltip={showCopiedTooltip}
            title="Open with:"
            urls={openWithToolUrls}
          />

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
          {createViewDialog}
        </div>
        <PrecomputedMetadataTable precomputed={precomputed} />
      </div>
    </div>
  );
}
