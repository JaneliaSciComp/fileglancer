import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';

import { sendFetchRequest } from '@/utils';
import {
  getResponseJsonOrError,
  throwResponseNotOkError
} from '@/queries/queryUtils';
import type { Job, JobSubmitRequest } from '@/shared.types';

// --- Query Keys ---

export const jobsQueryKeys = {
  all: ['cluster-jobs'] as const,
  list: () => ['cluster-jobs', 'list'] as const,
  detail: (id: number) => ['cluster-jobs', 'detail', id] as const
};

// --- Fetch Helpers ---

async function fetchJobs(signal?: AbortSignal): Promise<Job[]> {
  const response = await sendFetchRequest('/api/jobs', 'GET', undefined, {
    signal
  });
  const data = await getResponseJsonOrError(response);
  if (!response.ok) {
    throwResponseNotOkError(response, data);
  }
  return (data as { jobs: Job[] }).jobs;
}

// --- Query Hooks ---

export function useJobsQuery(): UseQueryResult<Job[], Error> {
  return useQuery({
    queryKey: jobsQueryKeys.list(),
    queryFn: ({ signal }) => fetchJobs(signal),
    // Auto-refresh every 5 seconds
    refetchInterval: query => {
      const jobs = query.state.data;
      if (!jobs) {
        return false;
      }
      const hasActive = jobs.some(
        j => j.status === 'PENDING' || j.status === 'RUNNING'
      );
      return hasActive ? 5000 : false;
    }
  });
}

// --- Mutation Hooks ---

export function useSubmitJobMutation(): UseMutationResult<
  Job,
  Error,
  JobSubmitRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (request: JobSubmitRequest) => {
      const response = await sendFetchRequest(
        '/api/jobs',
        'POST',
        request as unknown as Record<string, unknown>
      );
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data as Job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobsQueryKeys.all });
    }
  });
}

export function useCancelJobMutation(): UseMutationResult<Job, Error, number> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: number) => {
      const response = await sendFetchRequest(`/api/jobs/${jobId}`, 'DELETE');
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data as Job;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobsQueryKeys.all });
    }
  });
}
