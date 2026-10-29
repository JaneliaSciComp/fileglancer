import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgLink from '@/components/designSystem/atoms/FgLink';
import CancelJobDialog from '@/components/ui/Dialogs/CancelJob';
import DeleteJobDialog from '@/components/ui/Dialogs/DeleteJob';
import RenameNameDialog from '@/components/ui/Dialogs/RenameName';
import { TableCard } from '@/components/ui/Table/TableCard';
import { createAppsJobsColumns } from '@/components/ui/Table/appsJobsColumns';
import { buildRelaunchPath, parseGithubUrl } from '@/utils';
import { showErrorToast } from '@/utils/errorToast';
import type { Job } from '@/shared.types';
import {
  useJobsQuery,
  useCancelJobMutation,
  useDeleteJobMutation,
  useUpdateJobMutation
} from '@/queries/jobsQueries';

export default function AppJobs() {
  const navigate = useNavigate();
  const jobsQuery = useJobsQuery();
  const cancelJobMutation = useCancelJobMutation();
  const deleteJobMutation = useDeleteJobMutation();
  const updateJobMutation = useUpdateJobMutation();
  const [jobToCancel, setJobToCancel] = useState<Job | null>(null);
  const [jobToDelete, setJobToDelete] = useState<number | null>(null);
  const [jobToRename, setJobToRename] = useState<Job | null>(null);

  const handleViewJobDetail = (jobId: number) => {
    navigate(`/apps/jobs/${jobId}`);
  };

  const handleRelaunch = (job: Job) => {
    const { owner, repo, branch } = parseGithubUrl(job.app_url);
    const path = buildRelaunchPath(
      owner,
      repo,
      branch,
      job.entry_point_id,
      job.manifest_path || undefined
    );
    navigate(path, {
      state: {
        parameters: job.parameters,
        env_parameters: job.env_parameters,
        resources: job.resources,
        env: job.env,
        clean_env: job.clean_env,
        pre_run: job.pre_run,
        post_run: job.post_run,
        container: job.container,
        container_args: job.container_args
      }
    });
  };

  const handleConfirmCancelJob = async () => {
    if (!jobToCancel) {
      return;
    }
    const job = jobToCancel;
    setJobToCancel(null);
    try {
      await cancelJobMutation.mutateAsync(job.id);
      toast.success(
        job.entry_point_type === 'service' ? 'Service stopped' : 'Job cancelled'
      );
    } catch (error) {
      showErrorToast(error, 'Failed to cancel job');
    }
  };

  const handleConfirmDeleteJob = async () => {
    if (jobToDelete === null) {
      return;
    }
    try {
      await deleteJobMutation.mutateAsync(jobToDelete);
      toast.success('Job deleted');
      setJobToDelete(null);
    } catch (error) {
      showErrorToast(error, 'Failed to delete job');
    }
  };

  const handleConfirmRename = async (name: string) => {
    if (!jobToRename) {
      return;
    }
    await updateJobMutation.mutateAsync({ jobId: jobToRename.id, name });
    toast.success('Job renamed');
  };

  const jobsColumns = useMemo(
    () =>
      createAppsJobsColumns({
        onViewDetail: handleViewJobDetail,
        onRelaunch: handleRelaunch,
        onRename: setJobToRename,
        onCancel: setJobToCancel,
        onDelete: setJobToDelete
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div>
      <Typography className="mb-6 text-foreground">
        Jobs are runs of command-line tools on the compute cluster that are
        launched from the <FgLink to="/apps">My Apps</FgLink> tab.
      </Typography>

      <TableCard
        columns={jobsColumns}
        data={jobsQuery.data || []}
        dataType="jobs"
        errorState={jobsQuery.error}
        gridColsClass="grid-cols-[3fr_1fr_2fr_1fr_1fr]"
        initialPageSize={50}
        loadingState={jobsQuery.isPending}
      />

      <CancelJobDialog
        isPending={cancelJobMutation.isPending}
        isService={jobToCancel?.entry_point_type === 'service'}
        onClose={() => setJobToCancel(null)}
        onConfirm={handleConfirmCancelJob}
        open={jobToCancel !== null}
      />

      <DeleteJobDialog
        isPending={deleteJobMutation.isPending}
        onClose={() => setJobToDelete(null)}
        onConfirm={handleConfirmDeleteJob}
        open={jobToDelete !== null}
      />

      <RenameNameDialog
        initialName={
          jobToRename
            ? jobToRename.name ||
              `${jobToRename.app_name} - ${jobToRename.entry_point_name}`
            : ''
        }
        onClose={() => setJobToRename(null)}
        onSave={handleConfirmRename}
        open={jobToRename !== null}
        saving={updateJobMutation.isPending}
        title="Rename Job"
      />
    </div>
  );
}
