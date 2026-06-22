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
        Data links can be created for any file or folder. They provide a 
        S3-compatible RESTful interface to your data, which can be used 
        to open files in external viewers like Neuroglancer.
      </Typography>
      <TableCard
        columns={linksColumns}
        data={allProxiedPathsQuery.data || []}
        dataType="data links"
        errorState={allProxiedPathsQuery.error}
        gridColsClass="grid-cols-[1.5fr_2.5fr_1.5fr_1fr_1fr]"
        loadingState={
          allProxiedPathsQuery.isPending || preferenceQuery.isPending
        }
      />
    </>
  );
}
