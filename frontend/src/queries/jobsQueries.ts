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

async function fetchJob(jobId: number, signal?: AbortSignal): Promise<Job> {
  const response = await sendFetchRequest(
    `/api/jobs/${jobId}`,
    'GET',
    undefined,
    {
      signal
    }
  );
  const data = await getResponseJsonOrError(response);
  if (!response.ok) {
    throwResponseNotOkError(response, data);
  }
  return data as Job;
}

async function fetchJobFile(
  jobId: number,
  fileType: string,
  signal?: AbortSignal
): Promise<string | null> {
  const response = await sendFetchRequest(
    `/api/jobs/${jobId}/files/${fileType}`,
    'GET',
    undefined,
    { signal }
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileType}`);
  }
  return response.text();
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

export function useJobQuery(jobId: number): UseQueryResult<Job, Error> {
  return useQuery({
    queryKey: jobsQueryKeys.detail(jobId),
    queryFn: ({ signal }) => fetchJob(jobId, signal),
    refetchInterval: query => {
      const job = query.state.data;
      if (!job) {
        return false;
      }
      return job.status === 'PENDING' || job.status === 'RUNNING'
        ? 5000
        : false;
    }
  });
}

export function useJobFileQuery(
  jobId: number,
  fileType: string
): UseQueryResult<string | null, Error> {
  return useQuery({
    queryKey: [...jobsQueryKeys.detail(jobId), 'file', fileType],
    queryFn: ({ signal }) => fetchJobFile(jobId, fileType, signal),
    refetchInterval: query => {
      // Only auto-refresh if file doesn't exist yet (null) - it may appear later
      return query.state.data === null ? 10000 : false;
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
      const response = await sendFetchRequest(
        `/api/jobs/${jobId}/cancel`,
        'POST'
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

export function useDeleteJobMutation(): UseMutationResult<
  unknown,
  Error,
  number
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: number) => {
      const response = await sendFetchRequest(`/api/jobs/${jobId}`, 'DELETE');
      const data = await getResponseJsonOrError(response);
      if (!response.ok) {
        throwResponseNotOkError(response, data);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobsQueryKeys.all });
    }
  });
}
