import { useState } from 'react';

import { useTicketContext } from '@/contexts/TicketsContext';
import { createSuccess, handleError } from '@/utils/errorHandling';
import { joinPaths } from '@/utils/pathHandling';
import type { Result } from '@/shared.types';

export default function useConvertFileDialog() {
  const [destinationFolder, setDestinationFolder] = useState<string>('');
  const [outputFilename, setOutputFilename] = useState<string>('');
  const { createTicket, tasksEnabled } = useTicketContext();

  async function handleTicketSubmit(): Promise<Result<void>> {
    if (!tasksEnabled) {
      setDestinationFolder('');
      setOutputFilename('');
      return handleError(new Error('Task functionality is disabled.'));
    }

    try {
      // Combine destination folder and filename if filename is provided
      const fullDestination = outputFilename
        ? joinPaths(destinationFolder, outputFilename)
        : destinationFolder;

      await createTicket(fullDestination);
      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    } finally {
      setDestinationFolder('');
      setOutputFilename('');
    }
  }

  return {
    destinationFolder,
    setDestinationFolder,
    outputFilename,
    setOutputFilename,
    handleTicketSubmit
  };
}
