import React from 'react';
import toast from 'react-hot-toast';

import { copyToClipboard } from '@/utils/copyText';

export default function useCopiedTooltip() {
  const [showCopiedTooltip, setShowCopiedTooltip] = React.useState(false);

  const handleCopyUrl = async (url: string) => {
    const result = await copyToClipboard(url);
    if (result.success) {
      setShowCopiedTooltip(true);
      setTimeout(() => {
        setShowCopiedTooltip(false);
      }, 2000);
    } else {
      toast.error('Failed to copy URL to clipboard');
    }
  };

  return { showCopiedTooltip, handleCopyUrl };
}
