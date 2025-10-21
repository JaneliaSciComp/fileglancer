import type { FileOrFolder, Result } from '@/shared.types';
import { getFileBrowsePath, sendFetchRequest } from '@/utils';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { handleError, createSuccess, toHttpError } from '@/utils/errorHandling';

export default function useDeleteDialog() {
  const { cookies } = useCookiesContext();
  const { fileQuery, refreshFiles } = useFileBrowserContext();

  async function handleDelete(targetItem: FileOrFolder): Promise<Result<void>> {
    if (!fileQuery.data.currentFileSharePath) {
      return handleError(
        new Error('Current file share path not set; cannot delete item')
      );
    }

    const fetchPath = getFileBrowsePath(
      fileQuery.data.currentFileSharePath.name,
      targetItem.path
    );

    try {
      const response = await sendFetchRequest(
        fetchPath,
        'DELETE',
        cookies['_xsrf']
      );
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
