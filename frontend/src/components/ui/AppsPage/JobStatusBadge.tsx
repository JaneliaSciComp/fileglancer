import type { Job } from '@/shared.types';

const STATUS_STYLES: Record<
  Job['status'],
  { bg: string; text: string; label: string }
> = {
  PENDING: {
    bg: 'bg-secondary/20',
    text: 'text-secondary',
    label: 'Pending'
  },
  RUNNING: {
    bg: 'bg-info/20',
    text: 'text-info',
    label: 'Running'
  },
  DONE: {
    bg: 'bg-success/20',
    text: 'text-success',
    label: 'Done'
  },
  FAILED: {
    bg: 'bg-error/20',
    text: 'text-error',
    label: 'Failed'
  },
  KILLED: {
    bg: 'bg-warning/20',
    text: 'text-warning',
    label: 'Killed'
  }
};

interface JobStatusBadgeProps {
  readonly status: Job['status'];
}

export default function JobStatusBadge({ status }: JobStatusBadgeProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.FAILED;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      {status === 'RUNNING' ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-info" />
        </span>
      ) : null}
      {style.label}
    </span>
  );
}
