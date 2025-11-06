import {
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryResult,
  UseMutationResult
} from '@tanstack/react-query';

import { sendFetchRequest, HTTPError } from '@/utils';
import { toHttpError } from '@/utils/errorHandling';
import type { Ticket } from '@/contexts/TicketsContext';

/**
 * Raw API response structure from /api/ticket endpoints
 */
type TicketsApiResponse = {
  tickets?: Ticket[];
};

/**
 * Payload for creating a ticket
 */
type CreateTicketPayload = {
  fsp_name: string;
  path: string;
  project_key: string;
  issue_type: string;
  summary: string;
  description: string;
};

// Query key factory for tickets
export const ticketsQueryKeys = {
  all: ['tickets'] as const,
  list: () => ['tickets', 'list'] as const,
  detail: (fspName: string, path: string) =>
    ['tickets', 'detail', fspName, path] as const
};

/**
 * Sort tickets by date (newest first)
 */
function sortTicketsByDate(tickets: Ticket[]): Ticket[] {
  return tickets.sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
  );
}

/**
 * Fetches all tickets from the backend
 * Returns empty array if no tickets exist (404)
 */
const fetchAllTickets = async (signal?: AbortSignal): Promise<Ticket[]> => {
  try {
    const response = await sendFetchRequest('/api/ticket', 'GET', undefined, {
      signal
    });
    if (response.status === 404) {
      // Not an error, just no tickets available
      return [];
    }
    if (!response.ok) {
      throw await toHttpError(response);
    }
    const data = (await response.json()) as TicketsApiResponse;
    if (data?.tickets) {
      return sortTicketsByDate(data.tickets);
    }
    return [];
  } catch (error) {
    if (error instanceof HTTPError && error.responseCode === 404) {
      return []; // No tickets found
    }
    throw error;
  }
};

/**
 * Fetches a single ticket by FSP name and path
 * Returns null if no ticket exists (404)
 */
const fetchTicketByPath = async (
  fspName: string,
  path: string,
  signal?: AbortSignal
): Promise<Ticket | null> => {
  try {
    const response = await sendFetchRequest(
      `/api/ticket?fsp_name=${encodeURIComponent(fspName)}&path=${encodeURIComponent(path)}`,
      'GET',
      undefined,
      { signal }
    );

    if (response.status === 404) {
      // Not an error, just no ticket available
      return null;
    }

    if (!response.ok) {
      throw await toHttpError(response);
    }

    const data = (await response.json()) as TicketsApiResponse;
    if (data?.tickets && data.tickets.length > 0) {
      return data.tickets[0];
    }
    return null;
  } catch (error) {
    if (error instanceof HTTPError && error.responseCode === 404) {
      return null; // No ticket found
    }
    throw error;
  }
};

/**
 * Query hook for fetching all tickets
 *
 * @param enabled - Whether the query should run (respects VITE_ENABLE_TASKS)
 * @returns Query result with all tickets
 */
export function useAllTicketsQuery(
  enabled: boolean = false
): UseQueryResult<Ticket[], Error> {
  return useQuery<Ticket[], Error>({
    queryKey: ticketsQueryKeys.list(),
    queryFn: ({ signal }) => fetchAllTickets(signal),
    enabled
  });
}

/**
 * Query hook for fetching a ticket by FSP name and path
 *
 * @param fspName - File share path name
 * @param path - File/folder path
 * @param enabled - Whether the query should run
 * @returns Query result with single ticket or null
 */
export function useTicketByPathQuery(
  fspName: string | undefined,
  path: string | undefined,
  enabled: boolean = false
): UseQueryResult<Ticket | null, Error> {
  const shouldFetch = enabled && !!fspName && !!path;

  return useQuery<Ticket | null, Error>({
    queryKey: ticketsQueryKeys.detail(fspName ?? '', path ?? ''),
    queryFn: ({ signal }) => fetchTicketByPath(fspName!, path!, signal),
    enabled: shouldFetch,
    staleTime: 30 * 1000 // 30 seconds
  });
}

/**
 * Mutation hook for creating a new ticket
 *
 * @example
 * const mutation = useCreateTicketMutation();
 * mutation.mutate(payload);
 */
export function useCreateTicketMutation(): UseMutationResult<
  Ticket,
  Error,
  CreateTicketPayload,
  { previousTickets?: Ticket[] }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateTicketPayload, { signal }) => {
      const response = await sendFetchRequest('/api/ticket', 'POST', payload, {
        signal
      });
      if (!response.ok) {
        throw await toHttpError(response);
      }
      const ticketData = (await response.json()) as Ticket;
      return ticketData;
    },
    // Optimistic update for all tickets list
    onMutate: async (newTicket: CreateTicketPayload) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ticketsQueryKeys.all });

      // Get previous tickets
      const previousTickets = queryClient.getQueryData<Ticket[]>(
        ticketsQueryKeys.list()
      );

      return { previousTickets };
    },
    // On success, update both the list and the specific ticket detail
    onSuccess: (newTicket: Ticket) => {
      // Update the detail query for this specific ticket
      queryClient.setQueryData(
        ticketsQueryKeys.detail(newTicket.fsp_name, newTicket.path),
        newTicket
      );

      // Invalidate and refetch the list
      queryClient.invalidateQueries({
        queryKey: ticketsQueryKeys.all
      });
    },
    // On error, rollback
    onError: (_err, _variables, context) => {
      if (context?.previousTickets) {
        queryClient.setQueryData(
          ticketsQueryKeys.list(),
          context.previousTickets
        );
      }
    }
  });
}
