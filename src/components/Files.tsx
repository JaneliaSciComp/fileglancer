import React from 'react';

// import useContextMenu from '../hooks/useContextMenu';
// import useShowPropertiesDrawer from '../hooks/useShowPropertiesDrawer';
// import usePropertiesTarget from '../hooks/usePropertiesTarget';
// import useHideDotFiles from '../hooks/useHideDotFiles';
// import useSelectedFiles from '../hooks/useSelectedFiles';

// import FileList from './ui/FileBrowser/FileList';
// import PropertiesDrawer from './ui/PropertiesDrawer/PropertiesDrawer';
// import Toolbar from './ui/FileBrowser/Toolbar';
// // import ContextMenu from './ui/FileBrowser/ContextMenu';
// import RenameDialog from './ui/FileBrowser/Dialogs/RenameDialog';
// import NewFolderDialog from './ui/FileBrowser/Dialogs/NewFolderDialog';
// import Delete from './ui/FileBrowser/Dialogs/Delete';
// import ChangePermissions from './ui/FileBrowser/Dialogs/ChangePermissions';

export default function Files() {
  // const {
  //   contextMenuCoords,
  //   showContextMenu,
  //   setShowContextMenu,
  //   menuRef,
  //   handleRightClick
  // } = useContextMenu();
  // const { showPropertiesDrawer, setShowPropertiesDrawer } =
  //   useShowPropertiesDrawer();
  // const { propertiesTarget, setPropertiesTarget } = usePropertiesTarget();
  // const { hideDotFiles, setHideDotFiles, displayFiles } = useHideDotFiles();
  // const { selectedFiles, setSelectedFiles } = useSelectedFiles();

  // const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  // const [showNewFolderDialog, setShowNewFolderDialog] = React.useState(false);
  // const [showRenameDialog, setShowRenameDialog] = React.useState(false);
  // const [showPermissionsDialog, setShowPermissionsDialog] =
  //   React.useState(false);

  return (
    <div className="flex-1 overflow-auto flex flex-col">
      {/* <Toolbar
        hideDotFiles={hideDotFiles}
        setHideDotFiles={setHideDotFiles}
        setShowPropertiesDrawer={setShowPropertiesDrawer}
        setShowNewFolderDialog={setShowNewFolderDialog}
      />
      <div className="relative grow">
        <PropertiesDrawer
          propertiesTarget={propertiesTarget}
          open={showPropertiesDrawer}
          setShowPropertiesDrawer={setShowPropertiesDrawer}
          setShowPermissionsDialog={setShowPermissionsDialog}
        />
        <FileList
          displayFiles={displayFiles}
          selectedFiles={selectedFiles}
          setSelectedFiles={setSelectedFiles}
          showPropertiesDrawer={showPropertiesDrawer}
          setPropertiesTarget={setPropertiesTarget}
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
      ) : null} */}
    </div>
  );
}
