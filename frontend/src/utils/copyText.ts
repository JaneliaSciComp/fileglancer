import { default as log } from '@/logger';
import { createSuccess, handleError } from './errorHandling';
import type { Result } from '@/shared.types';

// Clipboard when the clipboard API is not available (like when using insecure HTTP)
// From https://stackoverflow.com/questions/400212/how-do-i-copy-to-the-clipboard-in-javascript/30810322#30810322
function fallbackCopyTextToClipboard(text: string) {
  const textArea = document.createElement('textarea');
  try {
    textArea.value = text;
    // Avoid scrolling to bottom
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    if (document.execCommand('copy')) {
      log.info('Fallback clipboard copy succeeded');
    } else {
      throw new Error('Fallback clipboard copy failed');
    }
  } finally {
    document.body.removeChild(textArea);
  }
}

const copyToClipboard = async (text: string | null): Promise<Result<void>> => {
  if (text) {
    try {
      if (!navigator.clipboard) {
        fallbackCopyTextToClipboard(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      log.info('Copied to clipboard:', text);
    } catch (error) {
      return handleError(error);
    }
    return createSuccess(undefined);
  } else {
    return handleError(new Error('No text provided to copy to clipboard'));
  }
};

export { copyToClipboard };
