import toast from 'react-hot-toast';

import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import { copyToClipboard } from '@/utils/copyText';

export default function useProxiedPathRow({
  setShowDataLinkDialog
}: {
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const handleCopyPath = async (displayPath: string): Promise<void> => {
    const result = await copyToClipboard(displayPath);
    if (result.success) {
      toast.success('Path copied!');
    } else {
      toast.error(`Error copying path: ${result.error}`);
    }
  };

  const handleCopyUrl = async (item: ProxiedPath): Promise<void> => {
    const result = await copyToClipboard(item.url);
    if (result.success) {
      toast.success('Sharing link copied!');
    } else {
      toast.error(`Error copying sharing link: ${result.error}`);
    }
  };

  const handleUnshare = async () => {
    setShowDataLinkDialog(true);
  };

  return {
    handleCopyPath,
    handleCopyUrl,
    handleUnshare
  };
}
