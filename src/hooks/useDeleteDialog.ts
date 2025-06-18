import type { FileOrFolder } from '@/shared.types';
import {
  getFileBrowsePath,
  sendFetchRequest,
  removeLastSegmentFromPath,
  tryCatchWrapper
} from '@/utils';
import { useCookiesContext } from '@/contexts/CookiesContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

export default function useDeleteDialog() {
  const { cookies } = useCookiesContext();
  const { handleFileBrowserNavigation, currentFileSharePath } =
    useFileBrowserContext();

  async function handleDelete(targetItem: FileOrFolder) {
    if (!currentFileSharePath) {
      return {
        success: false,
        error: 'No file share path selected.'
      };
    }

    const fetchPath = getFileBrowsePath(
      currentFileSharePath.name,
      targetItem.path
    );

    return tryCatchWrapper('Delete file or folder', async () => {
      await sendFetchRequest(fetchPath, 'DELETE', cookies['_xsrf']);
      const navResult = await handleFileBrowserNavigation({
        fspName: currentFileSharePath.name,
        path: removeLastSegmentFromPath(targetItem.path)
      });

      if (!navResult.success) {
        return {
          success: false,
          error: `Delete succeeded but navigation failed: ${navResult.error}`
        };
      }

      return {
        success: true,
        targetPath: targetItem.path
      };
    });
  }

  return { handleDelete };
}
