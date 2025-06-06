import React from 'react';
import { useOutletContext } from 'react-router';

import type { FileOrFolder } from '@/shared.types';
import useContextMenu from '@/hooks/useContextMenu';
import useHideDotFiles from '@/hooks/useHideDotFiles';
import useSelectedFiles from '@/hooks/useSelectedFiles';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

import FileList from './ui/FileBrowser/FileList';
import Toolbar from './ui/FileBrowser/Toolbar';
import ContextMenu from './ui/FileBrowser/ContextMenu';
import RenameDialog from './ui/Dialogs/RenameDialog';
import NewFolderDialog from './ui/Dialogs/NewFolderDialog';
import Delete from './ui/Dialogs/Delete';
import ChangePermissions from './ui/Dialogs/ChangePermissions';

type OutletContextType = {
  setShowPermissionsDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPropertiesDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  setPropertiesTarget: React.Dispatch<
    React.SetStateAction<FileOrFolder | null>
  >;
  setShowSidebar: React.Dispatch<React.SetStateAction<boolean>>;
  showPermissionsDialog: boolean;
  showPropertiesDrawer: boolean;
  propertiesTarget: FileOrFolder | null;
  showSidebar: boolean;
};

export default function Browse() {
  const {
    setShowPermissionsDialog,
    setShowPropertiesDrawer,
    setPropertiesTarget,
    setShowSidebar,
    showPermissionsDialog,
    showPropertiesDrawer,
    propertiesTarget,
    showSidebar
  } = useOutletContext<OutletContextType>();

  const {
    contextMenuCoords,
    showContextMenu,
    setShowContextMenu,
    menuRef,
    handleRightClick
  } = useContextMenu();

  const { hideDotFiles, setHideDotFiles } = useHideDotFiles();
  const { selectedFiles, setSelectedFiles } = useSelectedFiles();
  const { files } = useFileBrowserContext();

  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = React.useState(false);
  const [showRenameDialog, setShowRenameDialog] = React.useState(false);

  return (
    <div className="flex-1 overflow-auto flex flex-col">
      <Toolbar
        selectedFiles={selectedFiles}
        hideDotFiles={hideDotFiles}
        setHideDotFiles={setHideDotFiles}
        showPropertiesDrawer={showPropertiesDrawer}
        setShowPropertiesDrawer={setShowPropertiesDrawer}
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        setShowNewFolderDialog={setShowNewFolderDialog}
      />
      <div className="relative grow">
        <FileList
          files={files}
          selectedFiles={selectedFiles}
          setSelectedFiles={setSelectedFiles}
          showPropertiesDrawer={showPropertiesDrawer}
          setPropertiesTarget={setPropertiesTarget}
          hideDotFiles={hideDotFiles}
          handleRightClick={handleRightClick}
        />
      </div>
      {showContextMenu ? (
        <ContextMenu
          x={contextMenuCoords.x}
          y={contextMenuCoords.y}
          menuRef={menuRef}
          selectedFiles={selectedFiles}
          setShowPropertiesDrawer={setShowPropertiesDrawer}
          setShowContextMenu={setShowContextMenu}
          setShowRenameDialog={setShowRenameDialog}
          setShowDeleteDialog={setShowDeleteDialog}
          setShowPermissionsDialog={setShowPermissionsDialog}
        />
      ) : null}
      {showRenameDialog ? (
        <RenameDialog
          propertiesTarget={propertiesTarget}
          showRenameDialog={showRenameDialog}
          setShowRenameDialog={setShowRenameDialog}
        />
      ) : null}
      {showNewFolderDialog ? (
        <NewFolderDialog
          showNewFolderDialog={showNewFolderDialog}
          setShowNewFolderDialog={setShowNewFolderDialog}
        />
      ) : null}
      {showDeleteDialog ? (
        <Delete
          targetItem={selectedFiles[0]}
          showDeleteDialog={showDeleteDialog}
          setShowDeleteDialog={setShowDeleteDialog}
        />
      ) : null}
      {showPermissionsDialog ? (
        <ChangePermissions
          targetItem={propertiesTarget}
          showPermissionsDialog={showPermissionsDialog}
          setShowPermissionsDialog={setShowPermissionsDialog}
        />
      ) : null}
    </div>
  );
}
