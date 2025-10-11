import React from 'react';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useProfileContext } from './ProfileContext';
import { sendFetchRequest, joinPaths } from '@/utils';
import type { Result } from '@/shared.types';
import { createSuccess, handleError, toHttpError } from '@/utils/errorHandling';

export type Ticket = {
  username: string;
  path: string;
  fsp_name: string;
  key: string;
  created: string;
  updated: string;
  status: string;
  resolution: string;
  description: string;
  link: string;
  comments: unknown[];
};

type TicketContextType = {
  ticket: Ticket | null;
  allTickets?: Ticket[];
  loadingTickets?: boolean;
  createTicket: (destination: string) => Promise<void>;
  fetchAllTickets: () => Promise<Result<Ticket[] | null>>;
  refreshTickets: () => Promise<Result<void>>;
};

function sortTicketsByDate(tickets: Ticket[]): Ticket[] {
  return tickets.sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
  );
}

const TicketContext = React.createContext<TicketContextType | null>(null);

export const useTicketContext = () => {
  const context = React.useContext(TicketContext);
  if (!context) {
    throw new Error('useTicketContext must be used within a TicketProvider');
  }
  return context;
};

export const TicketProvider = ({
  children
}: {
  readonly children: React.ReactNode;
}) => {
  const [allTickets, setAllTickets] = React.useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = React.useState<boolean>(true);
  const [ticket, setTicket] = React.useState<Ticket | null>(null);
  const { cookies } = useCookiesContext();
  const { fileBrowserState } = useFileBrowserContext();
  const { profile } = useProfileContext();

  const fetchAllTickets = React.useCallback(async (): Promise<
    Result<Ticket[] | null>
  > => {
    setLoadingTickets(true);
    try {
      const response = await sendFetchRequest(
        '/api/ticket',
        'GET',
        cookies['_xsrf']
      );
      if (response.ok) {
        const data = await response.json();
        if (data?.tickets) {
          return createSuccess(sortTicketsByDate(data.tickets) as Ticket[]);
        }
        // Not an error, just no tickets available
        return createSuccess(null);
      } else if (response.status === 404) {
        // This is not an error, just no tickets available
        return createSuccess(null);
      } else {
        throw await toHttpError(response);
      }
    } catch (error) {
      return handleError(error);
    } finally {
      setLoadingTickets(false);
    }
  }, [cookies]);

  const refreshTickets = async (): Promise<Result<void>> => {
    const result = await fetchAllTickets();
    if (result.success) {
      setAllTickets(result.data || []);
      return createSuccess(undefined);
    } else {
      return handleError(result.error);
    }
  };

  const fetchTicket = React.useCallback(async (): Promise<
    Result<Ticket | void>
  > => {
    if (
      !fileBrowserState.currentFileSharePath ||
      !fileBrowserState.propertiesTarget
    ) {
      // This is probably not an error, just the state before the file browser is ready
      return createSuccess(undefined);
    }

    try {
      const response = await sendFetchRequest(
        `/api/ticket?fsp_name=${fileBrowserState.currentFileSharePath.name}&path=${fileBrowserState.propertiesTarget.path}`,
        'GET',
        cookies['_xsrf']
      );

      if (!response.ok) {
        throw await toHttpError(response);
      } else {
        if (response.status === 404) {
          // This is not an error, just no ticket available
          return createSuccess(undefined);
        } else {
          const data = (await response.json()) as any;
          if (data?.tickets) {
            return createSuccess(data.tickets[0] as Ticket);
          } else {
            return createSuccess(undefined);
          }
        }
      }
    } catch (error) {
      return handleError(error);
    }
  }, [
    fileBrowserState.currentFileSharePath,
    fileBrowserState.propertiesTarget,
    cookies
  ]);

  async function createTicket(destinationFolder: string): Promise<void> {
    if (!fileBrowserState.currentFileSharePath) {
      throw new Error('No file share path selected');
    } else if (!fileBrowserState.propertiesTarget) {
      throw new Error('No properties target selected');
    }

    const messagePath = joinPaths(
      fileBrowserState.currentFileSharePath.mount_path,
      fileBrowserState.propertiesTarget.path
    );

    const createTicketResponse = await sendFetchRequest(
      '/api/ticket',
      'POST',
      cookies['_xsrf'],
      {
        fsp_name: fileBrowserState.currentFileSharePath.name,
        path: fileBrowserState.propertiesTarget.path,
        project_key: 'FT',
        issue_type: 'Task',
        summary: 'Convert file to ZARR',
        description: `Convert ${messagePath} to a ZARR file.\nDestination folder: ${destinationFolder}\nRequested by: ${profile?.username}`
      }
    );

    if (!createTicketResponse.ok) {
      throw await toHttpError(createTicketResponse);
    }

    const ticketData = await createTicketResponse.json();
    setTicket(ticketData);
  }

  React.useEffect(() => {
    (async function () {
      const result = await fetchAllTickets();
      if (result.success) {
        setAllTickets(result.data || []);
      }
    })();
  }, [fetchAllTickets]);

  React.useEffect(() => {
    (async function () {
      const result = await fetchTicket();
      if (result.success && result.data) {
        setTicket(result.data);
      } else {
        setTicket(null);
      }
    })();
  }, [fetchTicket]);

  return (
    <TicketContext.Provider
      value={{
        ticket,
        allTickets,
        loadingTickets,
        createTicket,
        fetchAllTickets,
        refreshTickets
      }}
    >
      {children}
    </TicketContext.Provider>
  );
};

export default TicketContext;
