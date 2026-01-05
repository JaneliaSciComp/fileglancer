import { useState } from 'react';
import { Button, Typography } from '@material-tailwind/react';
import { HiOutlinePlus } from 'react-icons/hi';
import toast from 'react-hot-toast';

import { TableCard } from '@/components/ui/Table/TableCard';
import { useViewsColumns } from '@/components/ui/Table/viewsColumns';
import NeuroglancerViewDialog from '@/components/ui/Dialogs/NeuroglancerViewDialog';
import { useNeuroglancerContext } from '@/contexts/NeuroglancerContext';
import type { NeuroglancerShortLink } from '@/queries/neuroglancerQueries';

export default function Views() {
  const {
    allNeuroglancerLinksQuery,
    createNeuroglancerShortLinkMutation,
    updateNeuroglancerShortLinkMutation
  } = useNeuroglancerContext();
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<NeuroglancerShortLink | undefined>(
    undefined
  );

  const handleOpenCreate = () => {
    setEditItem(undefined);
    setShowDialog(true);
  };

  const handleOpenEdit = (item: NeuroglancerShortLink) => {
    setEditItem(item);
    setShowDialog(true);
  };

  const handleClose = () => {
    setShowDialog(false);
    setEditItem(undefined);
  };

  const handleCreate = async (payload: {
    url: string;
    short_name?: string;
    title?: string;
  }) => {
    try {
      await createNeuroglancerShortLinkMutation.mutateAsync(payload);
      toast.success('Link created');
      handleClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create link';
      toast.error(message);
    }
  };

  const handleUpdate = async (payload: {
    short_key: string;
    url: string;
    title?: string;
  }) => {
    try {
      await updateNeuroglancerShortLinkMutation.mutateAsync(payload);
      toast.success('Link updated');
      handleClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update link';
      toast.error(message);
    }
  };

  const viewsColumns = useViewsColumns(handleOpenEdit);

  return (
    <>
      <Typography className="mb-6 text-foreground font-bold" type="h5">
        Neuroglancer Links
      </Typography>
      <Typography className="mb-6 text-foreground">
        Store Neuroglancer state for easy sharing. Create a short link and share
        it with internal collaborators. You can update the link later if needed.
      </Typography>
      <div className="mb-4">
        <Button
          className="bg-primary text-white hover:bg-primary/90"
          onClick={handleOpenCreate}
        >
          <HiOutlinePlus className="icon-default mr-2" />
          New Link
        </Button>
      </div>
      <TableCard
        columns={viewsColumns}
        data={allNeuroglancerLinksQuery.data || []}
        dataType="NG links"
        errorState={allNeuroglancerLinksQuery.error}
        gridColsClass="grid-cols-[1.2fr_2.8fr_1.2fr_1fr_0.6fr]"
        loadingState={allNeuroglancerLinksQuery.isPending}
      />
      {showDialog ? (
        <NeuroglancerViewDialog
          editItem={editItem}
          onClose={handleClose}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          open={showDialog}
          pending={
            createNeuroglancerShortLinkMutation.isPending ||
            updateNeuroglancerShortLinkMutation.isPending
          }
        />
      ) : null}
    </>
  );
}
