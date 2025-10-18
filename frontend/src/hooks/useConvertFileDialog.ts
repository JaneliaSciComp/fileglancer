import React from 'react';

import { useTicketContext } from '@/contexts/TicketsContext';
import { createSuccess, handleError } from '@/utils/errorHandling';
import type { Result } from '@/shared.types';

export default function useConvertFileDialog() {
  const [destinationFolder, setDestinationFolder] = React.useState<string>('');
  const { createTicket } = useTicketContext();

  async function handleTicketSubmit(): Promise<Result<void>> {
    try {
      await createTicket(destinationFolder);
      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    } finally {
      setDestinationFolder('');
    }
  }

  return {
    destinationFolder,
    setDestinationFolder,
    handleTicketSubmit
  };
}
