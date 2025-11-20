import { Typography } from '@material-tailwind/react';

import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { TableCard } from '@/components/ui/Table/TableCard';
import { useLinksColumns } from './ui/Table/linksColumns';

export default function Links() {
  const { allProxiedPathsQuery } = useProxiedPathContext();
  const { preferenceQuery } = usePreferencesContext();
  const linksColumns = useLinksColumns();

  return (
    <>
      <Typography className="mb-6 text-foreground font-bold" type="h5">
        Data Links
      </Typography>
      <Typography className="mb-6 text-foreground">
        Data links can be created for any Zarr folder in the file browser. They
        are used to open files in external viewers like Neuroglancer. You can
        share data links with internal collaborators.
      </Typography>
      <TableCard
        columns={linksColumns}
        data={allProxiedPathsQuery.data || []}
        dataType="data links"
        gridColsClass="grid-cols-[1.5fr_2.5fr_1.5fr_1fr_1fr]"
        loadingState={
          allProxiedPathsQuery.isPending || preferenceQuery.isPending
        }
      />
    </>
  );
}
