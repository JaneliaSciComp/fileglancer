import { Typography } from '@material-tailwind/react';

import TicketRow from '@/components/ui/JobsPage/TicketRow';
import { useTicketContext } from '@/contexts/TicketsContext';
import { TableCard } from './ui/widgets/TableCard';

export default function Jobs() {
  const { allTickets, loadingTickets } = useTicketContext();
  return (
    <>
      <Typography type="h5" className="mb-6 text-foreground font-bold">
        Tasks
      </Typography>
      <Typography className="mb-6 text-foreground">
        A task is created in Jira when you request a file to be converted to a
        different format. To start a file conversion task, select a file in the
        file browser, open the <strong>Properties</strong> panel, and click the{' '}
        <strong>Convert</strong> button.
      </Typography>
      <TableCard
        gridColsClass="grid-cols-[2fr_3fr_1fr_1fr]"
        rowTitles={['File Path', 'Job Description', 'Status', 'Last Updated']}
        rowContent={TicketRow}
        items={allTickets}
        loadingState={loadingTickets}
        emptyText="You have not opened any Jira tasks."
      />
    </>
  );
}
