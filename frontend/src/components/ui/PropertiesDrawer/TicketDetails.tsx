import { Fragment } from 'react';
import { Timeline, Typography, Button } from '@material-tailwind/react';
import { HiExternalLink } from 'react-icons/hi';

import { formatDateString } from '@/utils';
import { Link } from 'react-router';
import type { Ticket } from '@/contexts/TicketsContext';

/**
 * Sample ticket object:
created: "2025-07-14T07:43:53.007000-04:00"
description: "Please convert Users_truhlara_dev_fileglancer/fused-timeseries.zarr to a ZARR file.\nDestination folder: /Users/truhlara/dev/fileglancer/"
fsp_name: "Users_truhlara_dev_fileglancer"
key: "FT-54"
link: "https://issues.hhmi.org/issues/browse/FT-54"
path: "fused-timeseries.zarr"
resolution: "Unresolved"
status: "Open"
updated: "2025-07-14T07:43:53.007000-04:00"
username: "User(username='cb2e8bf0bc374ecbab87c53572cbba6f', name='Anonymous Eukelade', display_name='Anonymous Eukelade', initials='AE', avatar_url=None, color=None)"
 */

const possibleStatuses = ['Open', 'Pending', 'Work in progress', 'Done'];

function TimelineSegment({
  step,
  index,
  ticket
}: {
  readonly step: string;
  readonly index: number;
  readonly ticket: Ticket;
}) {
  const ticketStatus = ticket.status;
  const isCurrentStep = ticketStatus === step;
  const isFirstStep = index === 0;
  const isLastStep = index === possibleStatuses.length - 1;
  const isFutureStep =
    possibleStatuses.indexOf(ticketStatus as string) <
    possibleStatuses.indexOf(step);

  return (
    <Timeline.Item>
      <Timeline.Header>
        {isLastStep ? null : (
          <Timeline.Separator
            className={isFutureStep ? '!bg-surface' : '!bg-primary'}
          />
        )}

        <Timeline.Icon
          className={`h-3 w-3 ${isFutureStep ? '!bg-surface' : '!bg-primary'}`}
        />
      </Timeline.Header>

      <Timeline.Body className="-translate-y-1.5">
        <Typography
          className={`${isFutureStep ? 'text-foreground' : 'text-primary font-bold'}`}
        >
          {step}
        </Typography>
        {isCurrentStep || isFirstStep ? (
          <Typography
            className={`mt-2 ${isFirstStep && !isCurrentStep ? 'text-foreground' : 'text-primary'}`}
            type="small"
          >
            {isFirstStep && !isCurrentStep
              ? `Opened: ${formatDateString(ticket.created)}`
              : `Last updated: ${formatDateString(ticket.updated)}`}
          </Typography>
        ) : null}
      </Timeline.Body>
    </Timeline.Item>
  );
}

type TicketDetailsProps = {
  readonly ticket: Ticket;
};

export default function TicketDetails({ ticket }: TicketDetailsProps) {
  // Format description to properly display line breaks
  const formattedDescription = ticket.description
    .split('\\n')
    .map((line, index) => (
      <Fragment key={index}>
        {line}
        {index < ticket.description.split('\\n').length - 1 ? <br /> : null}
      </Fragment>
    ));

  return (
    <div className="mt-4 flex flex-col gap-6 min-w-max w-full">
      {ticket.link ? (
        <Button
          as={Link}
          className="flex items-center justify-center gap-1 text-primary px-2 py-1 !self-start"
          rel="noopener noreferrer"
          size="sm"
          target="_blank"
          to={ticket.link}
          variant="outline"
        >
          View ticket in JIRA
          <HiExternalLink className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      <div className="overflow-hidden rounded-lg border border-surface">
        <div className="p-2 border-b border-surface bg-surface-light text-sm text-foreground dark:bg-surface-dark font-semibold">
          Description
        </div>
        <div className="p-2 text-sm whitespace-pre-line">
          {formattedDescription}
        </div>
      </div>
      <Timeline orientation="vertical">
        {possibleStatuses.map((step, index) => (
          <TimelineSegment
            index={index}
            key={step}
            step={step}
            ticket={ticket}
          />
        ))}
      </Timeline>
    </div>
  );
}
