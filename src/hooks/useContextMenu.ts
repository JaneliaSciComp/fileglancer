import * as React from 'react';

import type { FileOrFolder, Result } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { handleError } from '@/utils/errorHandling';

export default function useContextMenu() {
  const [contextMenuCoords, setContextMenuCoords] = React.useState({
    x: 0,
    y: 0
  });
  const [showContextMenu, setShowContextMenu] = React.useState<boolean>(false);

  const menuRef = React.useRef<HTMLDivElement>(null);

  const { currentFileSharePath, setPropertiesTarget } = useFileBrowserContext();
  const { handleFavoriteChange } = usePreferencesContext();

  function onClose() {
    setShowContextMenu(false);
  }

  React.useEffect(() => {
    // Adjust menu position if it would go off screen
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = contextMenuCoords.x;
      let adjustedY = contextMenuCoords.y;

      if (contextMenuCoords.x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 5;
      }

      if (contextMenuCoords.y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 5;
      }

      menuRef.current.style.left = `${adjustedX}px`;
      menuRef.current.style.top = `${adjustedY}px`;
    }

    // Add click handler to close the menu when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenuCoords.x, contextMenuCoords.y]);

  function handleContextMenuClick(
    e: React.MouseEvent<HTMLDivElement>,
    file: FileOrFolder,
    selectedFiles: FileOrFolder[],
    setSelectedFiles: React.Dispatch<React.SetStateAction<FileOrFolder[]>>
  ) {
    e.preventDefault();
    e.stopPropagation();
    setPropertiesTarget(file);
    setContextMenuCoords({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    const currentIndex = selectedFiles.indexOf(file);
    const newSelectedFiles = currentIndex === -1 ? [file] : [...selectedFiles];
    setSelectedFiles(newSelectedFiles);
  }

  const handleContextMenuFavorite = async (
    selectedFiles: FileOrFolder[]
  ): Promise<Result<boolean>> => {
    if (currentFileSharePath) {
      return await handleFavoriteChange(
        {
          type: 'folder',
          folderPath: selectedFiles[0].path,
          fsp: currentFileSharePath
        },
        'folder'
      );
    } else {
      return handleError(new Error('No file share path selected'));
    }
  };

  return {
    contextMenuCoords,
    showContextMenu,
    setShowContextMenu,
    menuRef,
    handleContextMenuClick,
    handleContextMenuFavorite
  };
}
