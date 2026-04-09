import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import type { Result } from '@/shared.types';
import { createSuccess, handleError } from '@/utils/errorHandling';
import { getFileURL } from '@/utils/index';

export function useHandleView() {
  const { fileBrowserState, fileQuery } = useFileBrowserContext();

  const handleView = (): Result<void> => {
    if (
      !fileQuery.data?.currentFileSharePath ||
      !fileBrowserState.propertiesTarget
    ) {
      return handleError(new Error('No file selected for viewing'));
    }
    try {
      const url = getFileURL(
        fileQuery.data.currentFileSharePath.name,
        fileBrowserState.propertiesTarget.path
      );
      window.open(url, '_blank', 'noopener,noreferrer');
      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    }
  };

  return { handleView };
}
