import { useMemo } from 'react';

import { validateFileName } from '@/utils/validateFileName';
import type { FileNameValidation } from '@/utils/validateFileName';

type FileNameValidationResult = {
  isValid: boolean;
  errorMessage: string | undefined;
};

function getErrorMessage(
  validation: FileNameValidation,
  name: string
): string | undefined {
  if (!name.trim() || validation.isValid) {
    return undefined;
  }
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

export default function useFileNameValidation(
  name: string
): FileNameValidationResult {
  return useMemo(() => {
    const validation = validateFileName(name);
    return {
      isValid: validation.isValid,
      errorMessage: getErrorMessage(validation, name)
    };
  }, [name]);
}
