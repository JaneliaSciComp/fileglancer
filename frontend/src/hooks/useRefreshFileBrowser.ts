import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { fileQueryKeys } from '@/queries/fileQueries';
import { fileContentQueryKeys } from '@/queries/fileContentQueries';

export const useRefreshFileBrowser = () => {
  const { fileBrowserState, fspName, filePath } = useFileBrowserContext();
  const queryClient = useQueryClient();

  const refreshFileBrowser = async () => {
    if (!fspName || !filePath) {
      return;
    }

    // Check if we're viewing a file or a folder
    const isViewingFile =
      fileBrowserState.propertiesTarget &&
      !fileBrowserState.propertiesTarget.is_dir;

    if (isViewingFile) {
      // If viewing a file, invalidate file content query
      await queryClient.invalidateQueries({
        queryKey: fileContentQueryKeys.detail(fspName, filePath)
      });
      toast.success('File content refreshed!');
    } else {
      // If viewing a folder, invalidate file list query
      await queryClient.invalidateQueries({
        queryKey: fileQueryKeys.filePath(fspName, filePath)
      });
      toast.success('File browser refreshed!');
    }
  };

  return { refreshFileBrowser };
};
