import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Menu, Typography } from '@material-tailwind/react';
import useContextMenu from '@/hooks/useContextMenu';

export type ContextMenuItem = {
  name: string;
  action: () => boolean | void | Promise<boolean | void>; // return false to prevent auto-close
  shouldShow?: boolean;
  color?: string;
};

type ContextMenuProps = {
  readonly menuRef: RefObject<HTMLDivElement | null>;
  readonly items: ContextMenuItem[];
  readonly onClose: () => void;
};

export default function ContextMenu({
  menuRef,
  items,
  onClose
}: ContextMenuProps) {
  const { contextMenuCoords } = useContextMenu();

  const handleItemClick = async (item: ContextMenuItem) => {
    const result = await item.action();
    if (result !== false) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed z-[9999] min-w-40 rounded-lg space-y-0.5 border border-surface bg-background p-1"
      ref={menuRef}
      style={{
        left: `${contextMenuCoords.x}px`,
        top: `${contextMenuCoords.y}px`
      }}
    >
      {items
        .filter(item => item.shouldShow !== false)
        .map((item, index) => (
          <Menu.Item key={index} onClick={() => handleItemClick(item)}>
            <Typography
              className={`text-sm p-1 ${item.color || 'text-secondary-light'}`}
            >
              {item.name}
            </Typography>
          </Menu.Item>
        ))}
    </div>,
    document.body
  );
}
