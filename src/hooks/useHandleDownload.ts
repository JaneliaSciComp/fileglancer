import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { getFileURL } from '@/utils/index';
import { FileOrFolder } from '@/shared.types';

export function useHandleDownload(file: FileOrFolder) {
  const { fileBrowserState } = useFileBrowserContext();

  const handleDownload = () => {
    if (!fileBrowserState.currentFileSharePath) {
      return;
    }
    const downloadUrl = getFileURL(
      fileBrowserState.currentFileSharePath.name,
      file.path
    );
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return { handleDownload };
}
