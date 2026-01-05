import { useState } from 'react';
import { Button, Typography } from '@material-tailwind/react';
import { HiOutlinePlus } from 'react-icons/hi';
import toast from 'react-hot-toast';

import { TableCard } from '@/components/ui/Table/TableCard';
import { useViewsColumns } from '@/components/ui/Table/viewsColumns';
import NeuroglancerViewDialog from '@/components/ui/Dialogs/NeuroglancerViewDialog';
import { useNeuroglancerContext } from '@/contexts/NeuroglancerContext';

export default function Views() {
  const { allNeuroglancerLinksQuery, createNeuroglancerShortLinkMutation } =
    useNeuroglancerContext();
  const viewsColumns = useViewsColumns();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const handleCreate = async (payload: {
    url: string;
    short_name?: string;
  }) => {
    try {
      await createNeuroglancerShortLinkMutation.mutateAsync(payload);
      toast.success('Link created');
      setShowCreateDialog(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create link';
      toast.error(message);
    }
  };

  return (
    <>
      <Typography className="mb-6 text-foreground font-bold" type="h5">
        Neuroglancer Links
      </Typography>
      <Typography className="mb-6 text-foreground">
        Store Neuroglancer state for easy sharing. Create a short link and share
        it with collaborators.
      </Typography>
      <div className="mb-4">
        <Button
          className="bg-primary text-white hover:bg-primary/90"
          onClick={() => setShowCreateDialog(true)}
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
      {showCreateDialog ? (
        <NeuroglancerViewDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
          open={showCreateDialog}
          pending={createNeuroglancerShortLinkMutation.isPending}
        />
      ) : null}
    </>
  );
}
