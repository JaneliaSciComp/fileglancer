import React from 'react';
import ReactDOM from 'react-dom';
import { Menu, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import type { FileOrFolder } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';

type ContextMenuProps = {
  x: number;
  y: number;
  menuRef: React.RefObject<HTMLDivElement | null>;
  selectedFiles: FileOrFolder[];
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
  setShowPropertiesDrawer,
  setShowContextMenu,
  setShowRenameDialog,
  setShowDeleteDialog,
  setShowPermissionsDialog
}: ContextMenuProps): React.ReactNode {
  const { currentFileSharePath } = useFileBrowserContext();
  const { handleFavoriteChange } = usePreferencesContext();

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-40 rounded-lg space-y-0.5 border border-surface bg-background p-1"
      style={{
        left: `${x}px`,
        top: `${y}px`
      }}
    >
      <Menu.Item>
        {/* Show/hide properties drawer */}
        <Typography
          className="text-sm p-1 cursor-pointer text-secondary-light"
          onClick={() => {
            setShowPropertiesDrawer(true);
            setShowContextMenu(false);
          }}
        >
          View file properties
        </Typography>
      </Menu.Item>
      {/* Set/unset folders as favorites */}
      {selectedFiles.length === 1 && selectedFiles[0].is_dir ? (
        <Menu.Item>
          <Typography
            className="text-sm p-1 cursor-pointer text-secondary-light"
            onClick={async () => {
              if (currentFileSharePath) {
                const result = await handleFavoriteChange(
                  {
                    type: 'folder',
                    folderPath: selectedFiles[0].path,
                    fsp: currentFileSharePath
                  },
                  'folder'
                );
                if (!result.success) {
                  toast.error(`Failed to update favorites: ${result.error}`);
                }
              }
              setShowContextMenu(false);
            }}
          >
            Set/unset as favorite
          </Typography>
        </Menu.Item>
      ) : null}
      {/* Rename file or folder */}
      {selectedFiles.length === 1 ? (
        <Menu.Item>
          <Typography
            onClick={() => {
              setShowRenameDialog(true);
              setShowContextMenu(false);
            }}
            className="text-left text-sm p-1 cursor-pointer text-secondary-light"
          >
            Rename
          </Typography>
        </Menu.Item>
      ) : null}
      {/* Change permissions on file(s) */}
      {selectedFiles.length === 1 && !selectedFiles[0].is_dir ? (
        <Menu.Item>
          <Typography
            className="text-sm p-1 cursor-pointer text-secondary-light"
            onClick={() => {
              setShowPermissionsDialog(true);
              setShowContextMenu(false);
            }}
          >
            Change permissions
          </Typography>
        </Menu.Item>
      ) : null}
      {/* Delete file(s) or folder(s) */}
      <Menu.Item>
        <Typography
          className="text-sm p-1 cursor-pointer text-red-600"
          onClick={() => {
            setShowDeleteDialog(true);
            setShowContextMenu(false);
          }}
        >
          Delete
        </Typography>
      </Menu.Item>
    </div>,

    document.body // Render context menu directly to body
  );
}
