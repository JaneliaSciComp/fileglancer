import { useState, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';

import type { FileOrFolder } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

export default function useContextMenu() {
  const [contextMenuCoords, setContextMenuCoords] = useState({
    x: 0,
    y: 0
  });
  const [showContextMenu, setShowContextMenu] = useState<boolean>(false);

  const menuRef = useRef<HTMLDivElement>(null);

  const { updateFilesWithContextMenuClick } = useFileBrowserContext();

  function onClose() {
    setShowContextMenu(false);
  }

  useEffect(() => {
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
    e: MouseEvent<HTMLDivElement>,
    file: FileOrFolder
  ) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuCoords({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    updateFilesWithContextMenuClick(file);
  }

  return {
    contextMenuCoords,
    showContextMenu,
    setShowContextMenu,
    menuRef,
    handleContextMenuClick
  };
}
