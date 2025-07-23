import React from 'react';
import logger, { default as log } from '@/logger';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useProfileContext } from './ProfileContext';
import {
  sendFetchRequest,
  getFileBrowsePath,
  getFullPath,
  joinPaths
} from '@/utils';
import type { Result } from '@/shared.types';

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
  createTicket: (
    destination: string
  ) => Promise<Result<Ticket[] | null, Error>>;
  fetchAllTickets: () => Promise<void>;
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

  const fetchAllTickets = React.useCallback(async (): Promise<void> => {
    const response = await sendFetchRequest(
      '/api/fileglancer/ticket',
      'GET',
      cookies['_xsrf']
    );
    if (!response.ok) {
      if (response.status === 404) {
        logger.warn('No tickets found');
        setAllTickets([]);
        return;
      } else {
        logger.error(
          `Failed to fetch tickets: ${response.status} ${response.statusText}`
        );
        return;
      }
    }
    const data = await response.json();
    logger.debug('Fetched all tickets:', data);
    if (data?.tickets) {
      setAllTickets(sortTicketsByDate(data.tickets) as Ticket[]);
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

  async function createTicket(
    destinationFolder: string
  ): Promise<Result<Ticket[] | null, Error>> {
    if (!currentFileSharePath) {
      return { ok: false, error: new Error('No file share path selected') };
    } else if (!propertiesTarget) {
      return { ok: false, error: new Error('No properties target selected') };
    }

    const fetchPath = getFileBrowsePath(
      currentFileSharePath.name,
      propertiesTarget.path
    );

    const messagePath = joinPaths(
      currentFileSharePath.mount_path,
      propertiesTarget.path
    );

    try {
      const checkPathResponse = await sendFetchRequest(
        fetchPath,
        'GET',
        cookies['_xsrf']
      );

      if (!checkPathResponse.ok && checkPathResponse.status === 404) {
        return {
          ok: false,
          error: new Error('File not found')
        };
      }

      const createTicketResponse = await sendFetchRequest(
        getFullPath('api/fileglancer/ticket'),
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

      const ticketData = await createTicketResponse.json();
      logger.debug('Ticket creation response:', ticketData);

      if (createTicketResponse.ok && createTicketResponse.status === 200) {
        logger.info('Ticket created successfully:', ticketData);
        setTicket(ticketData);
        return {
          ok: true,
          value: ticketData
        };
      } else if (!createTicketResponse.ok) {
        logger.error('Error creating ticket:', ticketData.error);
        return {
          ok: false,
          error: new Error(`Error creating ticket: ${ticketData.error}`)
        };
      }
    } catch (error) {
      return {
        ok: false,
        error: new Error(
          `Unknown error creating ticket${error instanceof Error ? `: ${error.message}` : ''}`
        )
      };
    }
    return { ok: true, value: null };
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
  }, [fetchTicket, propertiesTarget]);

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
