import React from 'react';
import ReactDOM from 'react-dom';
import { Menu, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import type { FileOrFolder } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { getPreferredPathForDisplay } from '@/utils';
import { copyToClipboard } from '@/utils/copyText';

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
  setShowConvertFileDialog: React.Dispatch<React.SetStateAction<boolean>>;
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
  setShowPermissionsDialog,
  setShowConvertFileDialog
}: ContextMenuProps): React.ReactNode {
  const { currentFileSharePath } = useFileBrowserContext();
  const { handleFavoriteChange, pathPreference } = usePreferencesContext();

  const fullPath = getPreferredPathForDisplay(
    pathPreference,
    currentFileSharePath,
    selectedFiles[0]?.path
  );

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className="fixed z-[9999] min-w-40 rounded-lg space-y-0.5 border border-surface bg-background p-1"
      style={{
        left: `${x}px`,
        top: `${y}px`
      }}
    >
      {/* Show/hide properties drawer */}
      <Menu.Item>
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
      {/* Copy path */}
      <Menu.Item>
        <Typography
          className="text-sm p-1 cursor-pointer text-secondary-light"
          onClick={() => {
            try {
              copyToClipboard(fullPath);
              toast.success('Path copied to clipboard!');
            } catch (error) {
              toast.error(`Failed to copy path. Error: ${error}`);
            }
          }}
        >
          Copy path
        </Typography>
      </Menu.Item>
      {/* Set/unset folders as favorites */}
      {selectedFiles.length === 1 && selectedFiles[0].is_dir ? (
        <>
          {/* Set/unset folders as favorites */}
          <Menu.Item>
            <Typography
              className="text-sm p-1 cursor-pointer text-secondary-light"
              onClick={async () => {
                if (currentFileSharePath) {
                  await handleFavoriteChange(
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
          </Menu.Item>
          {/* Change permissions on file(s) */}
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
        </>
      ) : null}
      {selectedFiles.length === 1 ? (
        <>
          {/* Convert file */}
          <Menu.Item>
            <Typography
              onClick={() => {
                setShowConvertFileDialog(true);
                setShowContextMenu(false);
              }}
              className="text-left text-sm p-1 cursor-pointer text-secondary-light"
            >
              Convert to ZARR
            </Typography>
          </Menu.Item>
          {/* Rename file or folder */}
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
        </>
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
