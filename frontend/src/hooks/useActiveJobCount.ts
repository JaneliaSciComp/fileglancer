import { useJobsQuery } from '@/queries/jobsQueries';

export function useActiveJobCount(): number {
  const { data: jobs } = useJobsQuery();
  if (!jobs) {
    return 0;
  }
  return jobs.filter(j => j.status === 'PENDING' || j.status === 'RUNNING')
    .length;
}
