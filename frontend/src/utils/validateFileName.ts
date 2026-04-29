type FileNameValidation = {
  isValid: boolean;
  isEmpty: boolean;
  hasSlashes: boolean;
  hasConsecutiveDots: boolean;
  hasPercent: boolean;
};

/**
 * Validates a filesystem file or folder name.
 * Rules: must not be empty, must not contain slashes, consecutive dots, or percent signs.
 */
function validateFileName(name: string): FileNameValidation {
  const trimmed = name.trim();
  const isEmpty = trimmed.length === 0;
  const hasSlashes = /[/\\]/.test(trimmed);
  const hasConsecutiveDots = /\.{2,}/.test(trimmed);
  const hasPercent = /%/.test(trimmed);

  return {
    isValid: !isEmpty && !hasSlashes && !hasConsecutiveDots && !hasPercent,
    isEmpty,
    hasSlashes,
    hasConsecutiveDots,
    hasPercent
  };
}

export { validateFileName };
export type { FileNameValidation };
