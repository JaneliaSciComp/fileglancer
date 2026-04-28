import FgBadge from '@/components/designSystem/atoms/FgBadge';
import type { Job } from '@/shared.types';

const STATUS_MAP: Record<
  Job['status'],
  {
    color: 'neutral' | 'info' | 'success' | 'error' | 'warning';
    label: string;
    dot?: boolean;
  }
> = {
  PENDING: { color: 'neutral', label: 'Pending' },
  RUNNING: { color: 'info', label: 'Running', dot: true },
  DONE: { color: 'success', label: 'Done' },
  FAILED: { color: 'error', label: 'Failed' },
  KILLED: { color: 'warning', label: 'Killed' }
};

export default function JobStatusBadge({
  status
}: {
  readonly status: Job['status'];
}) {
  const { color, label, dot } = STATUS_MAP[status] ?? STATUS_MAP.FAILED;
  return (
    <FgBadge color={color} dot={dot} variant="pill">
      {label}
    </FgBadge>
  );
}
