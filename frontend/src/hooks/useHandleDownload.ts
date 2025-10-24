import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { Result } from '@/shared.types';
import { createSuccess, handleError } from '@/utils/errorHandling';
import { getFileURL } from '@/utils/index';

export function useHandleDownload() {
  const { fileBrowserState } = useFileBrowserContext();

  const handleDownload = (): Result<void> => {
    if (
      !fileBrowserState.uiFileSharePath ||
      !fileBrowserState.propertiesTarget
    ) {
      return handleError(new Error('No file selected for download'));
    }
    try {
      const downloadUrl = getFileURL(
        fileBrowserState.uiFileSharePath.name,
        fileBrowserState.propertiesTarget.path
      );
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileBrowserState.propertiesTarget.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return createSuccess(undefined);
    } catch (error) {
      return handleError(error);
    }
  };

  return { handleDownload };
}
