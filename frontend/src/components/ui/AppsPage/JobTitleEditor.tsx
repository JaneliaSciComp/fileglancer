import toast from 'react-hot-toast';

import InlineNameEditor from '@/components/ui/widgets/InlineNameEditor';
import { showErrorToast } from '@/utils/errorToast';
import { useUpdateJobMutation } from '@/queries/jobsQueries';
import type { Job } from '@/shared.types';

export default function JobTitleEditor({ job }: { readonly job: Job }) {
  const displayName = job.name || `${job.app_name} - ${job.entry_point_name}`;
  const updateJobMutation = useUpdateJobMutation();

  return (
    <InlineNameEditor
      label="job name"
      onSave={async name => {
        try {
          await updateJobMutation.mutateAsync({ jobId: job.id, name });
          toast.success('Job renamed');
        } catch (error) {
          showErrorToast(error, 'Failed to rename job');
          throw error;
        }
      }}
      value={displayName}
    />
  );
}
