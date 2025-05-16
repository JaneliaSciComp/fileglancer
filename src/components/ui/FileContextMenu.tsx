import * as React from 'react';
import ReactDOM from 'react-dom';
import { Typography } from '@material-tailwind/react';

type ContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  setShowFileDrawer: (show: boolean) => void;
};

export default function FileContextMenu({
  x,
  y,
  onClose,
  setShowFileDrawer
}: ContextMenuProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    // Adjust menu position if it would go off screen
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 5;
      }

      if (y + rect.height > viewportHeight) {
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
  }, [x, y, onClose]);

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-background shadow-lg shadow-surface rounded-md p-2"
      style={{
        left: `${x}px`,
        top: `${y}px`
      }}
    >
      <div className="flex flex-col gap-2">
        <Typography
          className="text-sm p-1 cursor-pointer text-secondary-light hover:bg-secondary-light/30 transition-colors whitespace-nowrap"
          onClick={() => {
            setShowFileDrawer(true);
          }}
        >
          View file properties
        </Typography>
      </div>
    </div>,
    document.body // Render directly to body
  );
}
