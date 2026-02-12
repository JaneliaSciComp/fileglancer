import { useState } from 'react';
import { Button, Typography } from '@material-tailwind/react';
import { HiOutlinePlus } from 'react-icons/hi';
import toast from 'react-hot-toast';

import { TableCard } from '@/components/ui/Table/TableCard';
import { useNGLinksColumns } from '@/components/ui/Table/ngLinksColumns';
import NGLinkDialog from '@/components/ui/Dialogs/NGLinkDialog';
import FgDialog from '@/components/ui/Dialogs/FgDialog';
import DeleteBtn from '@/components/ui/buttons/DeleteBtn';
import { useNGLinkContext } from '@/contexts/NGLinkContext';
import type { CreateNGLinkPayload, NGLink } from '@/queries/ngLinkQueries';
import { copyToClipboard } from '@/utils/copyText';

export default function NGLinks() {
  const {
    allNGLinksQuery,
    createNGLinkMutation,
    updateNGLinkMutation,
    deleteNGLinkMutation
  } = useNGLinkContext();
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<NGLink | undefined>(undefined);
  const [deleteItem, setDeleteItem] = useState<NGLink | undefined>(undefined);

  const handleOpenCreate = () => {
    setEditItem(undefined);
    setShowDialog(true);
  };

  const handleOpenEdit = (item: NGLink) => {
    setEditItem(item);
    setShowDialog(true);
  };

  const handleClose = () => {
    setShowDialog(false);
    setEditItem(undefined);
  };

  const handleCreate = async (payload: CreateNGLinkPayload) => {
    try {
      const ngLink = await createNGLinkMutation.mutateAsync(payload);
      const result = await copyToClipboard(ngLink.neuroglancer_url);
      if (result.success) {
        toast.success('Link created and copied to clipboard');
      } else {
        toast.error(`Failed to copy link: ${result.error}`);
      }
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
      const ngLink = await updateNGLinkMutation.mutateAsync(payload);
      const result = await copyToClipboard(ngLink.neuroglancer_url);
      if (result.success) {
        toast.success('Link updated and copied to clipboard');
      } else {
        toast.error(`Failed to copy link: ${result.error}`);
      }
      handleClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update link';
      toast.error(message);
    }
  };

  const handleOpenDelete = (item: NGLink) => {
    setDeleteItem(item);
  };

  const handleCloseDelete = () => {
    setDeleteItem(undefined);
  };

  const handleConfirmDelete = async () => {
    if (!deleteItem) {
      return;
    }
    try {
      await deleteNGLinkMutation.mutateAsync(deleteItem.short_key);
      toast.success('Link deleted');
      handleCloseDelete();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete link';
      toast.error(message);
    }
  };

  const ngLinksColumns = useNGLinksColumns(handleOpenEdit, handleOpenDelete);

  return (
    <>
      <Typography className="mb-6 text-foreground font-bold" type="h5">
        Neuroglancer Links
      </Typography>
      <Typography className="mb-6 text-foreground">
        Store your Neuroglancer states for easy sharing. Create a short link and
        share it with internal collaborators. You can update the link later if
        needed.
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
        columns={ngLinksColumns}
        data={allNGLinksQuery.data || []}
        dataType="NG links"
        errorState={allNGLinksQuery.error}
        gridColsClass="grid-cols-[1.2fr_2.8fr_1.2fr_1fr_0.6fr]"
        loadingState={allNGLinksQuery.isPending}
      />
      {showDialog ? (
        <NGLinkDialog
          editItem={editItem}
          onClose={handleClose}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
          open={showDialog}
          pending={
            createNGLinkMutation.isPending || updateNGLinkMutation.isPending
          }
        />
      ) : null}
      {deleteItem ? (
        <FgDialog
          className="flex flex-col gap-4"
          onClose={handleCloseDelete}
          open={!!deleteItem}
        >
          <Typography className="text-foreground font-semibold">
            Are you sure you want to delete "
            {deleteItem.short_name || deleteItem.short_key}"?
          </Typography>
          <div className="flex gap-3">
            <DeleteBtn
              disabled={deleteNGLinkMutation.isPending}
              onClick={handleConfirmDelete}
              pending={deleteNGLinkMutation.isPending}
            />
            <Button
              className="!rounded-md"
              onClick={handleCloseDelete}
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </FgDialog>
      ) : null}
    </>
  );
}
