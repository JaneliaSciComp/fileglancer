import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import type { Result } from '@/shared.types';
import { handleError } from '@/utils/errorHandling';

export default function useFavoriteToggle() {
  const { fileBrowserState } = useFileBrowserContext();
  const { handleFavoriteChange } = usePreferencesContext();

  async function handleFavoriteToggle(
    inContextMenu: boolean
  ): Promise<Result<boolean>> {
    if (
      !fileBrowserState.currentFileSharePath ||
      !fileBrowserState.currentFolder
    ) {
      return handleError(
        new Error('A file share path must be set to favorite an item')
      );
    }
    try {
      if (inContextMenu && fileBrowserState.propertiesTarget) {
        return await handleFavoriteChange(
          {
            type: 'folder',
            folderPath: fileBrowserState.propertiesTarget.path,
            fsp: fileBrowserState.currentFileSharePath
          },
          'folder'
        );
      } else if (inContextMenu && !fileBrowserState.propertiesTarget) {
        throw new Error('Cannot add favorite - target folder not set');
      } else if (
        !fileBrowserState.currentFolder ||
        fileBrowserState.currentFolder.path === '.'
      ) {
        return await handleFavoriteChange(
          fileBrowserState.currentFileSharePath,
          'fileSharePath'
        );
      } else {
        return await handleFavoriteChange(
          {
            type: 'folder',
            folderPath: fileBrowserState.currentFolder.path,
            fsp: fileBrowserState.currentFileSharePath
          },
          'folder'
        );
      }
    } catch (error) {
      return handleError(error);
    }
  }

  return { handleFavoriteToggle };
}
