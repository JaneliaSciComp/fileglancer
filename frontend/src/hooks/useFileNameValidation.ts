import { useMemo } from 'react';

import { validateFileName } from '@/utils/validateFileName';
import type { FileNameValidation } from '@/utils/validateFileName';

type FileNameValidationResult = {
  isValid: boolean;
  errorMessage: string | undefined;
};

function getErrorMessage(validation: FileNameValidation): string | undefined {
  if (validation.hasSlashes) {
    return 'Cannot contain slashes.';
  }
  if (validation.hasPercent) {
    return 'Cannot contain percent signs (%).';
  }
  if (validation.hasConsecutiveDots) {
    return 'Cannot contain consecutive dots (..).';
  }
  return undefined;
}

/**
 * Validates a filename. Empty input is treated as valid here — callers that
 * require a non-empty name should gate on `name.trim()` separately so the
 * "required" UX (e.g. a disabled submit button) is decoupled from the
 * character-content validation.
 */
export default function useFileNameValidation(
  name: string
): FileNameValidationResult {
  return useMemo(() => {
    const validation = validateFileName(name);
    if (validation.isEmpty) {
      return { isValid: true, errorMessage: undefined };
    }
    return {
      isValid: validation.isValid,
      errorMessage: getErrorMessage(validation)
    };
  }, [name]);
}
