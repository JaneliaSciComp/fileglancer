import { useNavigate } from 'react-router';

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import { makeBrowseLink } from '@/utils';
import { copyToClipboard } from '@/utils/copyText';
import { createSuccess, handleError } from '@/utils/errorHandling';
import { FileSharePath, Result } from '@/shared.types';

export default function useProxiedPathRow({
  item,
  setShowDataLinkDialog
}: {
  item: ProxiedPath;
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { setCurrentFileSharePath } = useFileBrowserContext();
  const navigate = useNavigate();

  // Create navigation link for the file browser
  const browseLink = makeBrowseLink(item.fsp_name, item.path);

  const handleCopyPath = async (displayPath: string): Promise<Result<void>> => {
    try {
      await copyToClipboard(displayPath);
    } catch (error) {
      return handleError(error);
    }
    return createSuccess();
  };

  const handleCopyUrl = async (item: ProxiedPath): Promise<Result<void>> => {
    try {
      await copyToClipboard(item.url);
    } catch (error) {
      return handleError(error);
    }
    return createSuccess();
  };

  const handleUnshare = (pathFsp: FileSharePath) => {
    setCurrentFileSharePath(pathFsp);
    setShowDataLinkDialog(true);
  };

  const handleRowClick = () => {
    navigate(browseLink);
  };

  const handleNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(browseLink);
  };

  return {
    handleCopyPath,
    handleCopyUrl,
    handleUnshare,
    handleRowClick,
    handleNameClick
  };
}
