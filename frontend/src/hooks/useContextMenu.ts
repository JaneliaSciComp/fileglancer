import { useState, useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';

export default function useContextMenu<T = unknown>() {
  const [contextMenuCoords, setContextMenuCoords] = useState({
    x: 0,
    y: 0
  });
  const [showContextMenu, setShowContextMenu] = useState<boolean>(false);
  const [contextData, setContextData] = useState<T | undefined>(undefined);

  const menuRef = useRef<HTMLDivElement | null>(null);

  function closeContextMenu() {
    setShowContextMenu(false);
    setContextData(undefined);
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
    const handleClickOutside = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenuCoords.x, contextMenuCoords.y]);

  function openContextMenu(e: MouseEvent<HTMLElement>, data?: T) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuCoords({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    if (data !== undefined) {
      setContextData(data);
    }
  }

  return {
    contextMenuCoords,
    showContextMenu,
    contextData,
    menuRef,
    openContextMenu,
    closeContextMenu
  };
}
