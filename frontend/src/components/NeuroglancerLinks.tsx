import { useState } from 'react';
import { Typography, Button } from '@material-tailwind/react';
import { HiPlus } from 'react-icons/hi';

import { useNgLinksQuery } from '@/queries/ngLinkQueries';
import { TableCard } from '@/components/ui/Table/TableCard';
import { useNgLinksColumns } from './ui/Table/ngLinksColumns';
import NeuroglancerLinkDialog from './ui/Dialogs/NeuroglancerLinkDialog';

export default function NeuroglancerLinks() {
  const ngLinksQuery = useNgLinksQuery();
  const ngLinksColumns = useNgLinksColumns();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <Typography className="text-foreground font-bold" type="h5">
          Neuroglancer Links
        </Typography>
        <Button
          className="!rounded-md flex items-center gap-2"
          color="primary"
          onClick={() => setShowCreateDialog(true)}
          variant="solid"
        >
          <HiPlus className="icon-default" />
          <span>New Link</span>
        </Button>
      </div>
      <Typography className="mb-6 text-foreground">
        Neuroglancer links allow you to save and share Neuroglancer viewer
        states. Paste a Neuroglancer URL to create a short link that you can
        share with collaborators.
      </Typography>
      <TableCard
        columns={ngLinksColumns}
        data={ngLinksQuery.data || []}
        dataType="Neuroglancer links"
        errorState={ngLinksQuery.error}
        gridColsClass="grid-cols-[2fr_1.5fr_1fr_1fr]"
        loadingState={ngLinksQuery.isPending}
      />
      {showCreateDialog ? (
        <NeuroglancerLinkDialog
          mode="create"
          onClose={() => setShowCreateDialog(false)}
          open={showCreateDialog}
        />
      ) : null}
    </>
  );
}
