type FileNameValidation = {
  isValid: boolean;
  isEmpty: boolean;
  hasSlashes: boolean;
  hasConsecutiveDots: boolean;
  hasPercent: boolean;
};

const SLASHES_REGEX = /[/\\]/;
const CONSECUTIVE_DOTS_REGEX = /\.{2,}/;
const PERCENT_REGEX = /%/;

/**
 * Validates a filesystem file or folder name.
 * Rules: must not be empty, must not contain slashes, consecutive dots, or percent signs.
 */
function validateFileName(name: string): FileNameValidation {
  const trimmed = name.trim();
  const isEmpty = trimmed.length === 0;
  const hasSlashes = SLASHES_REGEX.test(trimmed);
  const hasConsecutiveDots = CONSECUTIVE_DOTS_REGEX.test(trimmed);
  const hasPercent = PERCENT_REGEX.test(trimmed);

  return {
    isValid: !isEmpty && !hasSlashes && !hasConsecutiveDots && !hasPercent,
    isEmpty,
    hasSlashes,
    hasConsecutiveDots,
    hasPercent
  };
}

type FilePathValidation = {
  isValid: boolean;
  isEmpty: boolean;
  hasConsecutiveDots: boolean;
};

/**
 * Validates a filesystem path (i.e. a folder destination). Slashes are
 * permitted because they're path separators, but consecutive dots are not
 * because they would resolve to a parent directory.
 */
function validateFilePath(path: string): FilePathValidation {
  const trimmed = path.trim();
  const isEmpty = trimmed.length === 0;
  const hasConsecutiveDots = CONSECUTIVE_DOTS_REGEX.test(trimmed);

  return {
    isValid: !isEmpty && !hasConsecutiveDots,
    isEmpty,
    hasConsecutiveDots
  };
}

export { validateFileName, validateFilePath };
export type { FileNameValidation, FilePathValidation };
