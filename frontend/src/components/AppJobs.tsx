import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import { TableCard } from '@/components/ui/Table/TableCard';
import { createAppsJobsColumns } from '@/components/ui/Table/appsJobsColumns';
import { buildRelaunchPath, parseGithubUrl } from '@/utils';
import type { Job } from '@/shared.types';
import {
  useJobsQuery,
  useCancelJobMutation,
  useDeleteJobMutation
} from '@/queries/jobsQueries';

export default function AppJobs() {
  const navigate = useNavigate();
  const jobsQuery = useJobsQuery();
  const cancelJobMutation = useCancelJobMutation();
  const deleteJobMutation = useDeleteJobMutation();

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
        env: job.env,
        pre_run: job.pre_run,
        post_run: job.post_run
      }
    });
  };

  const handleCancelJob = async (jobId: number) => {
    try {
      await cancelJobMutation.mutateAsync(jobId);
      toast.success('Job cancelled');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to cancel job';
      toast.error(message);
    }
  };

  const handleDeleteJob = async (jobId: number) => {
    try {
      await deleteJobMutation.mutateAsync(jobId);
      toast.success('Job deleted');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete job';
      toast.error(message);
    }
  };

  const jobsColumns = useMemo(
    () =>
      createAppsJobsColumns({
        onViewDetail: handleViewJobDetail,
        onRelaunch: handleRelaunch,
        onCancel: handleCancelJob,
        onDelete: handleDeleteJob
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div>
      <Typography className="mb-4 text-foreground font-bold" type="h5">
        Jobs
      </Typography>

      <TableCard
        columns={jobsColumns}
        data={jobsQuery.data || []}
        dataType="jobs"
        errorState={jobsQuery.error}
        gridColsClass="grid-cols-[2fr_2fr_1fr_2fr_1fr_1fr]"
        loadingState={jobsQuery.isPending}
      />
    </div>
  );
}
