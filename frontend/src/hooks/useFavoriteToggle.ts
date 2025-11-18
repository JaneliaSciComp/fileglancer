import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import type { Result } from '@/shared.types';
import { handleError } from '@/utils/errorHandling';

export default function useFavoriteToggle() {
  const { fileBrowserState, fileQuery } = useFileBrowserContext();
  const { currentFileSharePath, currentFileOrFolder } = fileQuery.data || {};
  const { handleFavoriteChange } = usePreferencesContext();

  async function handleFavoriteToggle(
    inContextMenu: boolean
  ): Promise<Result<boolean>> {
    if (!currentFileSharePath || !currentFileOrFolder) {
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
            fsp: currentFileSharePath
          },
          'folder'
        );
      } else if (inContextMenu && !fileBrowserState.propertiesTarget) {
        throw new Error('Cannot add favorite - target folder not set');
      } else if (!currentFileOrFolder || currentFileOrFolder.path === '.') {
        return await handleFavoriteChange(
          currentFileSharePath,
          'fileSharePath'
        );
      } else {
        return await handleFavoriteChange(
          {
            type: 'folder',
            folderPath: currentFileOrFolder.path,
            fsp: currentFileSharePath
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
