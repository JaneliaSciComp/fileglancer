import React from 'react';
import { useOutletContext } from 'react-router';

import useHideDotFiles from '@/hooks/useHideDotFiles';
import useSelectedFiles from '@/hooks/useSelectedFiles';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

import FileList from './ui/BrowsePage/FileList';
import Toolbar from './ui/BrowsePage/Toolbar';
import RenameDialog from './ui/Dialogs/Rename';
import NewFolderDialog from './ui/Dialogs/NewFolder';
import Delete from './ui/Dialogs/Delete';
import ChangePermissions from './ui/Dialogs/ChangePermissions';
import ConvertFileDialog from './ui/Dialogs/ConvertFile';
import RecentDataLinksCard from './ui/BrowsePage/Dashboard/RecentDataLinksCard';
import RecentlyViewedCard from './ui/BrowsePage/Dashboard/RecentlyViewedCard';
import NavigationInput from './ui/widgets/NavigateInput';
import NavigationDialog from './ui/Dialogs/Navigate';

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

  const { hideDotFiles, setHideDotFiles } = useHideDotFiles();
  const { selectedFiles, setSelectedFiles } = useSelectedFiles();
  const { currentFileSharePath } = useFileBrowserContext();

  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = React.useState(false);
  const [showRenameDialog, setShowRenameDialog] = React.useState(false);
  const [showNavigationDialog, setShowNavigationDialog] = React.useState(false);

  return (
    <div className="flex flex-col h-full max-h-full">
      <Toolbar
        hideDotFiles={hideDotFiles}
        setHideDotFiles={setHideDotFiles}
        showPropertiesDrawer={showPropertiesDrawer}
        setShowPropertiesDrawer={setShowPropertiesDrawer}
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        setShowNewFolderDialog={setShowNewFolderDialog}
        setShowNavigationDialog={setShowNavigationDialog}
      />
      <div
        className={`relative grow max-h-full flex flex-col overflow-y-auto ${!currentFileSharePath ? 'grid grid-cols-2 grid-rows-2 grid-rows-[60px_1fr] bg-surface-light gap-6 p-6' : ''}`}
      >
        {!currentFileSharePath ? (
          <>
            <NavigationInput location="dashboard" />
            <RecentlyViewedCard />
            <RecentDataLinksCard />
          </>
        ) : (
          <FileList
            selectedFiles={selectedFiles}
            setSelectedFiles={setSelectedFiles}
            showPropertiesDrawer={showPropertiesDrawer}
            hideDotFiles={hideDotFiles}
            setShowPropertiesDrawer={setShowPropertiesDrawer}
            setShowRenameDialog={setShowRenameDialog}
            setShowDeleteDialog={setShowDeleteDialog}
            setShowPermissionsDialog={setShowPermissionsDialog}
            setShowConvertFileDialog={setShowConvertFileDialog}
          />
        )}
      </div>
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
      {showNavigationDialog ? (
        <NavigationDialog
          showNavigationDialog={showNavigationDialog}
          setShowNavigationDialog={setShowNavigationDialog}
        />
      ) : null}
    </div>
  );
}
