import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { getFileURL } from '@/utils';

export function useHandleView() {
  const { fileBrowserState, fileQuery } = useFileBrowserContext();

  const handleView = () => {
    if (
      !fileQuery.data?.currentFileSharePath ||
      !fileBrowserState.propertiesTarget
    ) {
      return;
    }
    const url = getFileURL(
      fileQuery.data.currentFileSharePath.name,
      fileBrowserState.propertiesTarget.path
    );
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return { handleView };
}
