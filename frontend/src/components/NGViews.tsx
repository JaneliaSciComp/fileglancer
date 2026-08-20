import { useCallback, useState } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import { TableCard } from '@/components/ui/Table/TableCard';
import { useNGViewsColumns } from '@/components/ui/Table/ngViewsColumns';
import FgDialog from '@/components/ui/Dialogs/FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import { useViewsContext } from '@/contexts/ViewsContext';
import { useDefaultNeuroglancerBaseUrl } from '@/hooks/useDefaultNeuroglancerBaseUrl';
import type { View } from '@/queries/viewQueries';

export default function NGViews() {
  const { allViewsQuery, updateViewMutation, deleteViewMutation } =
    useViewsContext();
  const baseUrl = useDefaultNeuroglancerBaseUrl();

  const [renameItem, setRenameItem] = useState<View | undefined>(undefined);
  const [renameValue, setRenameValue] = useState('');
  const [deleteItem, setDeleteItem] = useState<View | undefined>(undefined);
  // Sources column is user-resizable via a drag handle in its header. Width
  // lives here (not in the column def) so a re-render on drag actually
  // re-flows the CSS grid template.
  const [sourcesColWidth, setSourcesColWidth] = useState(320);
  const clampSourcesWidth = useCallback(
    (w: number) => Math.max(120, Math.min(900, w)),
    []
  );
  const handleSourcesResize = useCallback(
    (next: number) => setSourcesColWidth(clampSourcesWidth(next)),
    [clampSourcesWidth]
  );

  const handleOpenRename = (item: View) => {
    setRenameItem(item);
    setRenameValue(item.name);
  };
  const handleCloseRename = () => setRenameItem(undefined);

  const handleConfirmRename = async () => {
    if (!renameItem) {
      return;
    }
    try {
      await updateViewMutation.mutateAsync({
        short_key: renameItem.short_key,
        name: renameValue.trim()
      });
      toast.success('View renamed');
      handleCloseRename();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Rename failed');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteItem) {
      return;
    }
    try {
      await deleteViewMutation.mutateAsync(deleteItem.short_key);
      toast.success('View deleted');
      setDeleteItem(undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delete failed');
    }
  };

  const columns = useNGViewsColumns(
    handleOpenRename,
    setDeleteItem,
    baseUrl,
    sourcesColWidth,
    handleSourcesResize
  );

  // Fixed pixel tracks for every column except Sources (user-resizable).
  // Fixed (not fr) so the row has a deterministic width — that's what lets
  // the outer overflow-x-auto scroll when Sources grows past the viewport.
  const gridColsStyle = `220px 80px ${sourcesColWidth}px 160px 180px 80px`;

  return (
    <>
      <div className="w-full">
        <Typography className="mb-2 text-foreground font-bold" type="h5">
          Views
        </Typography>
        <Typography className="mb-4 text-foreground">
          Your saved Views.
        </Typography>

        <TableCard
          columns={columns}
          data={allViewsQuery.data || []}
          dataType="views"
          errorState={allViewsQuery.error}
          gridColsStyle={gridColsStyle}
          loadingState={allViewsQuery.isPending}
        />
      </div>

      {renameItem ? (
        <FgDialog
          className="flex flex-col gap-4"
          onClose={handleCloseRename}
          open={!!renameItem}
        >
          <Typography className="text-foreground font-semibold">
            Rename View
          </Typography>
          <FgInput
            aria-label="View name"
            onChange={e => setRenameValue(e.target.value)}
            value={renameValue}
          />
          <div className="flex gap-3">
            <FgButton
              disabled={
                updateViewMutation.isPending || renameValue.trim() === ''
              }
              loading={updateViewMutation.isPending}
              loadingText="Saving..."
              onClick={handleConfirmRename}
            >
              Save
            </FgButton>
            <FgButton onClick={handleCloseRename} variant="ghost">
              Cancel
            </FgButton>
          </div>
        </FgDialog>
      ) : null}

      {deleteItem ? (
        <FgDialog
          className="flex flex-col gap-4"
          onClose={() => setDeleteItem(undefined)}
          open={!!deleteItem}
        >
          <Typography className="text-foreground font-semibold">
            Are you sure you want to delete "
            {deleteItem.name || deleteItem.short_key}"?
          </Typography>
          <div className="flex gap-3">
            <FgButton
              color="error"
              disabled={deleteViewMutation.isPending}
              loading={deleteViewMutation.isPending}
              loadingText="Deleting..."
              onClick={handleConfirmDelete}
            >
              Delete
            </FgButton>
            <FgButton onClick={() => setDeleteItem(undefined)} variant="ghost">
              Cancel
            </FgButton>
          </div>
        </FgDialog>
      ) : null}
    </>
  );
}
