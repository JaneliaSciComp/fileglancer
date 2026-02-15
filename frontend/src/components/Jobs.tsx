import { Typography } from '@material-tailwind/react';
import { Link } from 'react-router';

import { useTicketContext } from '@/contexts/TicketsContext';
import { TableCard } from './ui/Table/TableCard';
import { jobsColumns } from './ui/Table/jobsColumns';

export default function Jobs() {
  const { allTicketsQuery } = useTicketContext();
  return (
    <div data-tour="tasks-page">
      <Typography className="mb-6 text-foreground font-bold" type="h5">
        Tasks
      </Typography>
      <Typography className="mb-6 text-foreground">
        Jobs are runs of command-line tools on the compute cluster that are
        launched from the{' '}
        <Link className="text-primary underline" to="/fg/apps">
          Apps page
        </Link>
        .
      </Typography>
      <TableCard
        columns={jobsColumns}
        data={allTicketsQuery.data || []}
        dataType="tasks"
        errorState={allTicketsQuery.error}
        gridColsClass="grid-cols-[3fr_3fr_1fr_2fr]"
        loadingState={allTicketsQuery.isPending}
      />
    </div>
  );
}
