import type { FileOrFolder } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

export default function useDeleteDialog() {
  const { fileQuery, mutations } = useFileBrowserContext();

  async function handleDelete(targetItem: FileOrFolder): Promise<void> {
    if (!fileQuery.data?.currentFileSharePath) {
      throw new Error('Current file share path not set; cannot delete item');
    }

    await mutations.delete.mutateAsync({
      fspName: fileQuery.data.currentFileSharePath.name,
      filePath: targetItem.path
    });
  }

  return {
    handleDelete
  };
}
