import { useState } from 'react';
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

  const columns = useNGViewsColumns(handleOpenRename, setDeleteItem, baseUrl);

  return (
    <>
      <div className="w-full">
        <Typography className="mb-2 text-foreground font-bold" type="h5">
          Neuroglancer Views
        </Typography>
        <Typography className="mb-4 text-foreground">
          Your saved Neuroglancer Views.
        </Typography>

        <TableCard
          columns={columns}
          data={allViewsQuery.data || []}
          dataType="NG views"
          errorState={allViewsQuery.error}
          gridColsClass="grid-cols-[2fr_0.6fr_1fr_1fr_0.6fr]"
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
