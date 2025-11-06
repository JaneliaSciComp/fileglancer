import { useState } from 'react';

import { useTicketContext } from '@/contexts/TicketsContext';
import { createSuccess, handleError } from '@/utils/errorHandling';
import type { Result } from '@/shared.types';

export default function useConvertFileDialog() {
  const [destinationFolder, setDestinationFolder] = useState<string>('');
  const { createTicket, tasksEnabled } = useTicketContext();

  async function handleTicketSubmit(): Promise<Result<void>> {
    if (!tasksEnabled) {
      setDestinationFolder('');
      return handleError(new Error('Task functionality is disabled.'));
    }

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
