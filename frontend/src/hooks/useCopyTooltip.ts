import { useState } from 'react';
import toast from 'react-hot-toast';

import { copyToClipboard } from '@/utils/copyText';

export default function useCopyTooltip() {
  const [showCopiedTooltip, setShowCopiedTooltip] = useState(false);

  const handleCopy = async (text: string): Promise<void> => {
    const result = await copyToClipboard(text);
    if (result.success) {
      setShowCopiedTooltip(true);
      setTimeout(() => setShowCopiedTooltip(false), 2000);
    } else {
      toast.error('Failed to copy to clipboard');
    }
  };

  return { showCopiedTooltip, handleCopy };
}
