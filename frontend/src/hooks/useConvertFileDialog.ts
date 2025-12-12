import { useState, useMemo } from 'react';

import { useTicketContext } from '@/contexts/TicketsContext';
import { createSuccess, handleError } from '@/utils/errorHandling';
import { joinPaths } from '@/utils/pathHandling';
import type { Result } from '@/shared.types';

export default function useConvertFileDialog() {
  const [destinationFolder, setDestinationFolder] = useState<string>('');
  const [outputFilename, setOutputFilename] = useState<string>('');
  const { createTicket, tasksEnabled } = useTicketContext();

  // Validation for destination folder
  const destinationValidation = useMemo(() => {
    const trimmed = destinationFolder.trim();
    const hasConsecutiveDots = /\.{2,}/.test(trimmed);
    const isEmpty = trimmed.length === 0;

    return {
      isValid: !isEmpty && !hasConsecutiveDots,
      isEmpty,
      hasConsecutiveDots
    };
  }, [destinationFolder]);

  // Validation for output filename
  const filenameValidation = useMemo(() => {
    const trimmed = outputFilename.trim();
    const hasSlashes = /[/\\]/.test(trimmed);
    const hasConsecutiveDots = /\.{2,}/.test(trimmed);
    const isEmpty = trimmed.length === 0;

    return {
      isValid: !isEmpty && !hasSlashes && !hasConsecutiveDots,
      isEmpty,
      hasSlashes,
      hasConsecutiveDots
    };
  }, [outputFilename]);

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
    handleTicketSubmit,
    destinationValidation,
    filenameValidation
  };
}
