import React from 'react';
import ReactDOM from 'react-dom';
import { Typography } from '@material-tailwind/react';

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
      className="fixed z-[9999] bg-background shadow-lg shadow-surface rounded-md p-2"
      style={{
        left: `${x}px`,
        top: `${y}px`
      }}
    >
      <div className="flex flex-col gap-2">
        {/* Show/hide properties drawer */}
        <Typography
          className="text-sm p-1 cursor-pointer text-secondary-light hover:bg-secondary-light/30 transition-colors whitespace-nowrap"
          onClick={() => {
            setShowPropertiesDrawer(true);
            setShowContextMenu(false);
          }}
        >
          View file properties
        </Typography>
        {/* Set/unset folders as favorites */}
        {selectedFiles.length === 1 && selectedFiles[0].is_dir ? (
          <Typography
            className="text-sm p-1 cursor-pointer text-secondary-light hover:bg-secondary-light/30 transition-colors whitespace-nowrap"
            onClick={() => {
              if (currentFileSharePath) {
                handleFavoriteChange(
                  {
                    type: 'folder',
                    folderPath: selectedFiles[0].path,
                    fsp: currentFileSharePath
                  },
                  'folder'
                );
              }
              setShowContextMenu(false);
            }}
          >
            Set/unset as favorite
          </Typography>
        ) : null}
        {/* Rename file or folder */}
        {selectedFiles.length === 1 ? (
          <Typography
            onClick={() => {
              setShowRenameDialog(true);
              setShowContextMenu(false);
            }}
            className="text-left text-sm p-1 cursor-pointer text-secondary-light hover:bg-secondary-light/30 transition-colors whitespace-nowrap"
          >
            Rename
          </Typography>
        ) : null}
        {/* Change permissions on file(s) */}
        {selectedFiles.length === 1 && !selectedFiles[0].is_dir ? (
          <Typography
            className="text-sm p-1 cursor-pointer text-secondary-light hover:bg-secondary-light/30 transition-colors whitespace-nowrap"
            onClick={() => {
              setShowPermissionsDialog(true);
              setShowContextMenu(false);
            }}
          >
            Change permissions
          </Typography>
        ) : null}
        {/* Delete file(s) or folder(s) */}
        <Typography
          className="text-sm p-1 cursor-pointer text-secondary-light hover:bg-secondary-light/30 transition-colors whitespace-nowrap"
          onClick={() => {
            setShowDeleteDialog(true);
            setShowContextMenu(false);
          }}
        >
          Delete
        </Typography>
      </div>
    </div>,

    document.body // Render context menu directly to body
  );
}
