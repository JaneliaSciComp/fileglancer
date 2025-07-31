import React from 'react';
import logger, { default as log } from '@/logger';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useProfileContext } from './ProfileContext';
import { sendFetchRequest, getFileBrowsePath, joinPaths } from '@/utils';
import type { Result } from '@/shared.types';
import {
  createSuccess,
  getResponseError,
  handleError
} from '@/utils/errorHandling';

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
  createTicket: (destination: string) => Promise<void>;
  fetchAllTickets: () => Promise<Result<null>>;
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

export const TicketProvider = ({ children }: { children: React.ReactNode }) => {
  const [allTickets, setAllTickets] = React.useState<Ticket[]>([]);
  const [ticket, setTicket] = React.useState<Ticket | null>(null);
  const { cookies } = useCookiesContext();
  const { currentFileSharePath, propertiesTarget } = useFileBrowserContext();
  const { profile } = useProfileContext();

  const fetchAllTickets = React.useCallback(async (): Promise<Result<null>> => {
    try {
      const response = await sendFetchRequest(
        '/api/fileglancer/ticket',
        'GET',
        cookies['_xsrf']
      );
      const data = await response.json();
      if (data?.tickets) {
        setAllTickets(sortTicketsByDate(data.tickets) as Ticket[]);
      }
      return createSuccess();
      // if (response.status === 404) {
      //    logger.info('No tickets found');
      //    setAllTickets([]);
      //    return createSuccess([] as Ticket[]);
      //  }
    } catch (error) {
      return handleError(error);
    }
  }, [cookies]);

  const fetchTicket = React.useCallback(async () => {
    if (!currentFileSharePath || !propertiesTarget) {
      log.warn(
        'Cannot fetch ticket; no current file share path or file/folder selected'
      );
      return null;
    }
    try {
      const response = await sendFetchRequest(
        `/api/fileglancer/ticket?fsp_name=${currentFileSharePath?.name}&path=${propertiesTarget?.path}`,
        'GET',
        cookies['_xsrf']
      );
      if (!response.ok) {
        log.error(
          `Failed to fetch ticket: ${response.status} ${response.statusText}`
        );
        return null;
      }
      const data = (await response.json()) as any;
      log.debug('Fetched ticket:', data);
      if (data?.tickets) {
        return data.tickets[0] as Ticket;
      }
    } catch (error) {
      log.error('Error fetching ticket:', error);
    }
    return null;
  }, [currentFileSharePath, propertiesTarget, cookies]);

  async function createTicket(destinationFolder: string): Promise<void> {
    if (!currentFileSharePath) {
      throw new Error('No file share path selected');
    } else if (!propertiesTarget) {
      throw new Error('No properties target selected');
    }

    const fetchPath = getFileBrowsePath(
      currentFileSharePath.name,
      propertiesTarget.path
    );

    const messagePath = joinPaths(
      currentFileSharePath.mount_path,
      propertiesTarget.path
    );

    const checkPathResponse = await sendFetchRequest(
      fetchPath,
      'GET',
      cookies['_xsrf']
    );

    if (!checkPathResponse.ok) {
      const error = await getResponseError(checkPathResponse);
      throw new Error(error);
    }

    const createTicketResponse = await sendFetchRequest(
      '/api/fileglancer/ticket',
      'POST',
      cookies['_xsrf'],
      {
        fsp_name: currentFileSharePath.name,
        path: propertiesTarget.path,
        project_key: 'FT',
        issue_type: 'Task',
        summary: 'Convert file to ZARR',
        description: `Convert ${messagePath} to a ZARR file.\nDestination folder: ${destinationFolder}\nRequested by: ${profile?.username}`
      }
    );

    if (!createTicketResponse.ok) {
      const error = await getResponseError(checkPathResponse);
      throw new Error(error);
    }

    const ticketData = await createTicketResponse.json();
    logger.debug('Ticket creation response:', ticketData);

    logger.info('Ticket created successfully:', ticketData);
    setTicket(ticketData);
  }

  React.useEffect(() => {
    (async function () {
      await fetchAllTickets();
    })();
  }, [fetchAllTickets]);

  React.useEffect(() => {
    (async function () {
      if (!currentFileSharePath || !propertiesTarget) {
        return;
      }
      try {
        const ticket = await fetchTicket();
        if (ticket) {
          setTicket(ticket);
        } else {
          setTicket(null);
        }
      } catch (error) {
        log.error('Error in useEffect:', error);
      }
    })();
  }, [fetchTicket, propertiesTarget, currentFileSharePath]);

  return (
    <TicketContext.Provider
      value={{
        ticket,
        allTickets,
        createTicket,
        fetchAllTickets
      }}
    >
      {children}
    </TicketContext.Provider>
  );
};

export default TicketContext;
