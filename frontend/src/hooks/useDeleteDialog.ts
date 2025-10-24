import type { FileOrFolder, Result } from '@/shared.types';
import { getFileBrowsePath, sendFetchRequest } from '@/utils';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { handleError, createSuccess, toHttpError } from '@/utils/errorHandling';

export default function useDeleteDialog() {
  const { fileBrowserState, refreshFiles } = useFileBrowserContext();

  async function handleDelete(targetItem: FileOrFolder): Promise<Result<void>> {
    if (!fileBrowserState.uiFileSharePath) {
      return handleError(
        new Error('Current file share path not set; cannot delete item')
      );
    }

    const fetchPath = getFileBrowsePath(
      fileBrowserState.uiFileSharePath.name,
      targetItem.path
    );

    try {
      const response = await sendFetchRequest(fetchPath, 'DELETE');
      if (!response.ok) {
        if (response.status === 403) {
          return handleError(new Error('Permission denied'));
        } else {
          throw await toHttpError(response);
        }
      } else {
        await refreshFiles();
        return createSuccess(undefined);
      }
    } catch (error) {
      return handleError(error);
    }
  }

  return { handleDelete };
}
