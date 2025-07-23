import { Typography } from '@material-tailwind/react';

import TicketRow from '@/components/ui/JobsPage/TicketRow';
import { useTicketContext } from '@/contexts/TicketsContext';

export default function Jobs() {
  const { allTickets } = useTicketContext();
  return (
    <>
      <Typography type="h5" className="mb-6 text-foreground font-bold">
        Jobs
      </Typography>
      <Typography variant="small" className="mb-6 text-foreground">
        A job is created when you request a file to be converted to a different
        format. To start a file conversion job, select a file in the file
        browser, open the <strong>Properties</strong> panel, and click the{' '}
        <strong>Convert</strong> button.
      </Typography>
      <div className="rounded-lg shadow bg-background">
        <div className="grid grid-cols-[2fr_3fr_1fr_1fr] gap-4 px-4 py-2 border-b border-surface">
          <Typography className="font-bold">File Path</Typography>
          <Typography className="font-bold">Job Description</Typography>
          <Typography className="font-bold">Status</Typography>
          <Typography className="font-bold">Last Updated</Typography>
        </div>

        {allTickets?.map(ticket => (
          <TicketRow key={ticket.key} ticket={ticket} />
        ))}

        {!allTickets || allTickets.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500">
            You have not started any jobs.
          </div>
        ) : null}
      </div>
    </>
  );
}
