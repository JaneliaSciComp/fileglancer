import { Typography } from '@material-tailwind/react';

import { useTicketContext } from '@/contexts/TicketsContext';
import { TableCard } from './ui/Table/TableCard';
import { jobsColumns } from './ui/Table/jobsColumns';

export default function Jobs() {
  const { allTicketsQuery } = useTicketContext();
  return (
    <>
      <Typography className="mb-6 text-foreground font-bold" type="h5">
        Tasks
      </Typography>
      <Typography className="mb-6 text-foreground">
        A task is created when you request a file to be converted to a different
        format. To request a file conversion, select a file in the file browser,
        open the <strong>Properties</strong> panel, and click the{' '}
        <strong>Convert</strong> button.
      </Typography>
      <TableCard
        columns={jobsColumns}
        data={allTicketsQuery.data || []}
        emptyText="You have not made any conversion requests."
        gridColsClass="grid-cols-[2fr_3fr_1fr_1fr]"
        loadingState={allTicketsQuery.isPending}
      />
    </>
  );
}
