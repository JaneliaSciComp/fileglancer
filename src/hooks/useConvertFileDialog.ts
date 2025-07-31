import React from 'react';

import { useTicketContext } from '@/contexts/TicketsContext';
import { createSuccess, handleError } from '@/utils/errorHandling';
import type { Result } from '@/shared.types';

export default function useConvertFileDialog() {
  const [destinationFolder, setDestinationFolder] = React.useState<string>('');
  const { createTicket } = useTicketContext();

  async function handleTicketSubmit(): Promise<Result<null>> {
    try {
      await createTicket(destinationFolder);
    } catch (error) {
      return handleError(error);
    }
    setDestinationFolder('');
    return createSuccess();
  }

  return {
    destinationFolder,
    setDestinationFolder,
    handleTicketSubmit
  };
}
