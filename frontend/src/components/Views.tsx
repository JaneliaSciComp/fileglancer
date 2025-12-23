import { useState } from 'react';
import { IconButton, Typography } from '@material-tailwind/react';
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
    url?: string;
    state?: Record<string, unknown>;
    url_base?: string;
    short_name?: string;
  }) => {
    try {
      await createNeuroglancerShortLinkMutation.mutateAsync(payload);
      toast.success('View created');
      setShowCreateDialog(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create view';
      toast.error(message);
    }
  };

  return (
    <>
      <Typography className="mb-6 text-foreground font-bold" type="h5">
        Views
      </Typography>
      <Typography className="mb-6 text-foreground">
        Views store Neuroglancer state for easy sharing. Create a short link and
        share it with collaborators.
      </Typography>
      <TableCard
        columns={viewsColumns}
        data={allNeuroglancerLinksQuery.data || []}
        dataType="views"
        errorState={allNeuroglancerLinksQuery.error}
        gridColsClass="grid-cols-[1.2fr_2.8fr_1.2fr_1fr_0.6fr]"
        headerActions={
          <IconButton
            className="rounded-full bg-primary text-white hover:bg-primary/90"
            onClick={() => setShowCreateDialog(true)}
            variant="ghost"
          >
            <HiOutlinePlus className="icon-default" />
          </IconButton>
        }
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
