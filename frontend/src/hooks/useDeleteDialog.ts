import type { FileOrFolder } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

export default function useDeleteDialog() {
  const { fileBrowserState, mutations } = useFileBrowserContext();

  async function handleDelete(targetItem: FileOrFolder): Promise<void> {
    if (!fileBrowserState.uiFileSharePath) {
      throw new Error('Current file share path not set; cannot delete item');
    }

    await mutations.delete.mutateAsync({
      fspName: fileBrowserState.uiFileSharePath.name,
      filePath: targetItem.path
    });
  }

  return {
    handleDelete
  };
}
