import React from 'react';
import { useOutletContext } from 'react-router';

import useContextMenu from '@/hooks/useContextMenu';
import useHideDotFiles from '@/hooks/useHideDotFiles';
import useSelectedFiles from '@/hooks/useSelectedFiles';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

import FileList from './ui/FileBrowser/FileList';
import Toolbar from './ui/FileBrowser/Toolbar';
import ContextMenu from './ui/FileBrowser/ContextMenu';
import RenameDialog from './ui/Dialogs/Rename';
import NewFolderDialog from './ui/Dialogs/NewFolder';
import Delete from './ui/Dialogs/Delete';
import ChangePermissions from './ui/Dialogs/ChangePermissions';
import Dashboard from './ui/FileBrowser/Dashboard';
import ConvertFileDialog from './ui/Dialogs/ConvertFile';

type OutletContextType = {
  setShowPermissionsDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPropertiesDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  setShowSidebar: React.Dispatch<React.SetStateAction<boolean>>;
  setShowConvertFileDialog: React.Dispatch<React.SetStateAction<boolean>>;
  showPermissionsDialog: boolean;
  showPropertiesDrawer: boolean;
  showSidebar: boolean;
  showConvertFileDialog: boolean;
};

export default function Browse() {
  const {
    setShowPermissionsDialog,
    setShowPropertiesDrawer,
    setShowSidebar,
    setShowConvertFileDialog,
    showPermissionsDialog,
    showPropertiesDrawer,
    showSidebar,
    showConvertFileDialog
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
  const { currentFileSharePath } = useFileBrowserContext();

  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = React.useState(false);
  const [showRenameDialog, setShowRenameDialog] = React.useState(false);

  return (
    <div className="flex-1 flex flex-col h-full">
      <Toolbar
        hideDotFiles={hideDotFiles}
        setHideDotFiles={setHideDotFiles}
        showPropertiesDrawer={showPropertiesDrawer}
        setShowPropertiesDrawer={setShowPropertiesDrawer}
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        setShowNewFolderDialog={setShowNewFolderDialog}
      />
      <div className="relative grow h-full flex flex-col overflow-y-auto mb-3">
        {!currentFileSharePath ? (
          <Dashboard />
        ) : (
          <FileList
            selectedFiles={selectedFiles}
            setSelectedFiles={setSelectedFiles}
            showPropertiesDrawer={showPropertiesDrawer}
            hideDotFiles={hideDotFiles}
            handleRightClick={handleRightClick}
          />
        )}
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
          setShowConvertFileDialog={setShowConvertFileDialog}
        />
      ) : null}
      {showRenameDialog ? (
        <RenameDialog
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
          showPermissionsDialog={showPermissionsDialog}
          setShowPermissionsDialog={setShowPermissionsDialog}
        />
      ) : null}
      {showConvertFileDialog ? (
        <ConvertFileDialog
          showConvertFileDialog={showConvertFileDialog}
          setShowConvertFileDialog={setShowConvertFileDialog}
        />
      ) : null}
    </div>
  );
}
