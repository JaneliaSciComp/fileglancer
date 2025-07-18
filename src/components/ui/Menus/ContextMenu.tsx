import React from 'react';
import ReactDOM from 'react-dom';

import FgMenuItems, { MenuItem } from './FgMenuItems';
import type { FileOrFolder } from '@/shared.types';

type ContextMenuProps = {
  x: number;
  y: number;
  menuRef: React.RefObject<HTMLDivElement | null>;
  selectedFiles: FileOrFolder[];
  handleFavoriteToggleMenuItemClick: (props: {
    selectedFiles: FileOrFolder[];
  }) => void;
  setShowPropertiesDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  setShowContextMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setShowRenameDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPermissionsDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

type ContextMenuActionProps = {
  selectedFiles: FileOrFolder[];
  handleFavoriteToggleMenuItemClick: (props: {
    selectedFiles: FileOrFolder[];
  }) => void;
  setShowPropertiesDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  setShowContextMenu: React.Dispatch<React.SetStateAction<boolean>>;
  setShowRenameDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPermissionsDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function ContextMenu({
  x,
  y,
  menuRef,
  selectedFiles,
  handleFavoriteToggleMenuItemClick,
  setShowPropertiesDrawer,
  setShowContextMenu,
  setShowRenameDialog,
  setShowDeleteDialog,
  setShowPermissionsDialog
}: ContextMenuProps): React.ReactNode {
  const menuItems: MenuItem<ContextMenuActionProps>[] = [
    {
      name: 'View file properties',
      action: (props: ContextMenuActionProps) => {
        props.setShowPropertiesDrawer(true);
        props.setShowContextMenu(false);
      },
      shouldShow: true
    },
    {
      name: 'Set/unset as favorite',
      action: (props: ContextMenuActionProps) => {
        props.handleFavoriteToggleMenuItemClick({
          selectedFiles: props.selectedFiles
        });
      },
      shouldShow: selectedFiles[0].is_dir
    },
    {
      name: 'Rename',
      action: (props: ContextMenuActionProps) => {
        props.setShowRenameDialog(true);
        props.setShowContextMenu(false);
      },
      shouldShow: true
    },
    {
      name: 'Change permissions',
      action: (props: ContextMenuActionProps) => {
        props.setShowPermissionsDialog(true);
        props.setShowContextMenu(false);
      },
      shouldShow: !selectedFiles[0].is_dir
    },
    {
      name: 'Delete',
      action: (props: ContextMenuActionProps) => {
        props.setShowDeleteDialog(true);
        props.setShowContextMenu(false);
      },
      color: 'text-red-600',
      shouldShow: true
    }
  ];

  const actionProps = {
    selectedFiles,
    handleFavoriteToggleMenuItemClick,
    setShowPropertiesDrawer,
    setShowContextMenu,
    setShowRenameDialog,
    setShowDeleteDialog,
    setShowPermissionsDialog
  };

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-40 rounded-lg space-y-0.5 border border-surface bg-background p-1"
      style={{
        left: `${x}px`,
        top: `${y}px`
      }}
    >
      <FgMenuItems<ContextMenuActionProps>
        menuItems={menuItems}
        actionProps={actionProps}
      />
    </div>,

    document.body // Render context menu directly to body
  );
}
