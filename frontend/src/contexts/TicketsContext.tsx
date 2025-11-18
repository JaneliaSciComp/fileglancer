import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useProfileContext } from './ProfileContext';
import { joinPaths } from '@/utils';
import {
  useAllTicketsQuery,
  useTicketByPathQuery,
  useCreateTicketMutation
} from '@/queries/ticketsQueries';

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
  allTicketsQuery: ReturnType<typeof useAllTicketsQuery>;
  ticketByPathQuery: ReturnType<typeof useTicketByPathQuery>;
  createTicketMutation: ReturnType<typeof useCreateTicketMutation>;
  createTicket: (destination: string) => Promise<void>;
  tasksEnabled: boolean;
};

const TicketContext = createContext<TicketContextType | null>(null);

export const useTicketContext = () => {
  const context = useContext(TicketContext);
  if (!context) {
    throw new Error('useTicketContext must be used within a TicketProvider');
  }
  return context;
};

export const TicketProvider = ({
  children
}: {
  readonly children: ReactNode;
}) => {
  const { fileQuery, fileBrowserState } = useFileBrowserContext();
  const { profile } = useProfileContext();

  const tasksEnabled = import.meta.env.VITE_ENABLE_TASKS === 'true';

  // Initialize all queries and mutations (only enabled if tasksEnabled)
  const allTicketsQuery = useAllTicketsQuery(tasksEnabled);
  const ticketByPathQuery = useTicketByPathQuery(
    fileQuery.data?.currentFileSharePath?.name,
    fileBrowserState.propertiesTarget?.path,
    tasksEnabled && !fileQuery.isPending && !fileQuery.isError
  );
  const createTicketMutation = useCreateTicketMutation();

  // Helper function for creating tickets with validation
  const createTicket = async (destinationFolder: string): Promise<void> => {
    if (!tasksEnabled) {
      throw new Error('Task functionality is disabled.');
    }
    if (!fileQuery.data?.currentFileSharePath) {
      throw new Error('No file share path selected');
    }
    if (!fileBrowserState.propertiesTarget) {
      throw new Error('No properties target selected');
    }

    const messagePath = joinPaths(
      fileQuery.data.currentFileSharePath.mount_path,
      fileBrowserState.propertiesTarget.path
    );

    await createTicketMutation.mutateAsync({
      fsp_name: fileQuery.data.currentFileSharePath.name,
      path: fileBrowserState.propertiesTarget.path,
      project_key: 'FT',
      issue_type: 'Task',
      summary: 'Convert file to ZARR',
      description: `Convert ${messagePath} to a ZARR file.\nDestination folder: ${destinationFolder}\nRequested by: ${profile?.username}`
    });
  };

  const value: TicketContextType = {
    allTicketsQuery,
    ticketByPathQuery,
    createTicketMutation,
    createTicket,
    tasksEnabled
  };

  return (
    <TicketContext.Provider value={value}>{children}</TicketContext.Provider>
  );
};

export default TicketContext;
