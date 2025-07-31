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
import HomeCard from './ui/BrowsePage/Dashboard/HomeCard';
import RecentDataLinksCard from './ui/BrowsePage/Dashboard/RecentDataLinksCard';
import RecentlyViewedCard from './ui/BrowsePage/Dashboard/RecentlyViewedCard';

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
      <div className="relative grow h-full flex flex-col overflow-y-auto">
        {!currentFileSharePath ? (
          <div className="grid grid-cols-[minmax(100px,1fr)_minmax(200px,2fr)] w-full min-h-full bg-surface-light gap-6 p-6">
            {/* Left column - Home card and Recently Viewed */}
            <div className="flex flex-col gap-6">
              <div className="flex-shrink-0">
                <HomeCard />
              </div>
              <div className="flex-1">
                <RecentlyViewedCard />
              </div>
            </div>
            {/* Right column - Recent data links */}
            <div className="flex flex-col items-center">
              <RecentDataLinksCard />
            </div>
          </div>
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
    </div>
  );
}
