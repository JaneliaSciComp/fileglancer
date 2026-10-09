import { useCallback, useState } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import { TableCard } from '@/components/ui/Table/TableCard';
import {
  useNGViewsColumns,
  type RemoveSourceTarget
} from '@/components/ui/Table/ngViewsColumns';
import FgDialog from '@/components/ui/Dialogs/FgDialog';
import RelinkDialog, {
  type RelinkTarget
} from '@/components/ui/Dialogs/RelinkDialog';
import RemoveDatasetsDialog from '@/components/ui/Dialogs/RemoveDatasetsDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import { useViewsContext } from '@/contexts/ViewsContext';
import type { View } from '@/queries/viewQueries';

export default function NGViews() {
  const {
    allViewsQuery,
    updateViewMutation,
    deleteViewMutation,
    removeViewSourcesMutation
  } = useViewsContext();

  const [renameItem, setRenameItem] = useState<View | undefined>(undefined);
  const [renameValue, setRenameValue] = useState('');
  const [deleteItem, setDeleteItem] = useState<View | undefined>(undefined);
  // Sources column is user-resizable via a drag handle in its header. Width
  // lives here (not in the column def) so a re-render on drag actually
  // re-flows the CSS grid template.
  const [relinkTarget, setRelinkTarget] = useState<RelinkTarget | null>(null);
  const [removeSourceTarget, setRemoveSourceTarget] =
    useState<RemoveSourceTarget | null>(null);
  const [removeDatasetsItem, setRemoveDatasetsItem] = useState<
    View | undefined
  >(undefined);
  // null until the user drags: the column then flexes with the screen.
  const [sourcesColWidth, setSourcesColWidth] = useState<number | null>(null);
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

  const handleConfirmRemoveSource = async () => {
    if (!removeSourceTarget) {
      return;
    }
    try {
      await removeViewSourcesMutation.mutateAsync({
        short_key: removeSourceTarget.view.short_key,
        sources: [
          {
            fsp_name: removeSourceTarget.fsp_name,
            path: removeSourceTarget.path
          }
        ]
      });
      toast.success('Dataset removed from View');
      setRemoveSourceTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Remove failed');
    }
  };

  const columns = useNGViewsColumns(
    handleOpenRename,
    setDeleteItem,
    sourcesColWidth,
    handleSourcesResize,
    setRelinkTarget,
    setRemoveSourceTarget,
    setRemoveDatasetsItem
  );

  // minmax tracks start at their max and shrink toward their min on
  // narrower screens. Content never sizes a track, so the header and every
  // row (separate grids) stay aligned. Once dragged, Sources is fixed px and
  // the outer overflow-x-auto scrolls when it outgrows the viewport.
  const sourcesTrack =
    sourcesColWidth === null ? 'minmax(160px, 420px)' : `${sourcesColWidth}px`;
  const gridColsStyle = `minmax(100px, 160px) 100px ${sourcesTrack} minmax(150px, 160px) 56px`;

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

      {removeSourceTarget ? (
        <FgDialog
          className="flex flex-col gap-4"
          onClose={() => setRemoveSourceTarget(null)}
          open={!!removeSourceTarget}
        >
          <Typography className="text-foreground font-semibold">
            Remove this dataset from "
            {removeSourceTarget.view.name || removeSourceTarget.view.short_key}
            "?
          </Typography>
          <Typography className="text-foreground break-all" variant="small">
            {removeSourceTarget.displayPath}
          </Typography>
          <Typography className="text-foreground" variant="small">
            It will not load as a Neuroglancer layer. Removing it from the View
            does not affect the data itself.
          </Typography>
          <div className="flex gap-3">
            <FgButton
              color="error"
              disabled={removeViewSourcesMutation.isPending}
              loading={removeViewSourcesMutation.isPending}
              loadingText="Removing..."
              onClick={handleConfirmRemoveSource}
            >
              Remove
            </FgButton>
            <FgButton
              onClick={() => setRemoveSourceTarget(null)}
              variant="ghost"
            >
              Cancel
            </FgButton>
          </div>
        </FgDialog>
      ) : null}

      {removeDatasetsItem ? (
        <RemoveDatasetsDialog
          onClose={() => setRemoveDatasetsItem(undefined)}
          view={removeDatasetsItem}
        />
      ) : null}

      {relinkTarget ? (
        <RelinkDialog
          onClose={() => setRelinkTarget(null)}
          target={relinkTarget}
        />
      ) : null}
    </>
  );
}
