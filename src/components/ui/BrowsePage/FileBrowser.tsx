import * as React from 'react';
import { Typography } from '@material-tailwind/react';

import Crumbs from './Crumbs';
import ZarrPreview from './ZarrPreview';
import Table from './FileTable';
import FileViewer from './FileViewer';
import ContextMenu from '@/components/ui/Menus/ContextMenu';
import { FileRowSkeleton } from '@/components/ui/widgets/Loaders';
import useContextMenu from '@/hooks/useContextMenu';
import useZarrMetadata from '@/hooks/useZarrMetadata';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import useHideDotFiles from '@/hooks/useHideDotFiles';

type FileBrowserProps = {
  readonly showPropertiesDrawer: boolean;
  readonly togglePropertiesDrawer: () => void;
  readonly setShowRenameDialog: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setShowDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setShowPermissionsDialog: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  readonly setShowConvertFileDialog: React.Dispatch<
    React.SetStateAction<boolean>
  >;
};

export default function FileBrowser({
  showPropertiesDrawer,
  togglePropertiesDrawer,
  setShowRenameDialog,
  setShowDeleteDialog,
  setShowPermissionsDialog,
  setShowConvertFileDialog
}: FileBrowserProps): React.ReactNode {
  const { fileBrowserState, areFileDataLoading } = useFileBrowserContext();
  const { displayFiles } = useHideDotFiles();

  const {
    contextMenuCoords,
    showContextMenu,
    setShowContextMenu,
    menuRef,
    handleContextMenuClick
  } = useContextMenu();

  const {
    metadata,
    thumbnailSrc,
    openWithToolUrls,
    loadingThumbnail,
    thumbnailError,
    layerType
  } = useZarrMetadata();

  // If current item is a file, render the FileViewer instead of the file browser
  if (
    fileBrowserState.currentFileOrFolder &&
    !fileBrowserState.currentFileOrFolder.is_dir
  ) {
    return <FileViewer file={fileBrowserState.currentFileOrFolder} />;
  }

  return (
    <>
      <Crumbs />
      {metadata ? (
        <ZarrPreview
          layerType={layerType}
          loadingThumbnail={loadingThumbnail}
          metadata={metadata}
          openWithToolUrls={openWithToolUrls}
          thumbnailError={thumbnailError}
          thumbnailSrc={thumbnailSrc}
        />
      ) : null}

      {/* Loading state */}
      {areFileDataLoading ? (
        <div className="min-w-full bg-background select-none">
          {Array.from({ length: 10 }, (_, index) => (
            <FileRowSkeleton key={index} />
          ))}
        </div>
      ) : !areFileDataLoading && displayFiles.length > 0 ? (
        <Table
          data={displayFiles}
          handleContextMenuClick={handleContextMenuClick}
          showPropertiesDrawer={showPropertiesDrawer}
        />
      ) : !areFileDataLoading &&
        displayFiles.length === 0 &&
        !fileBrowserState.uiErrorMsg ? (
        <div className="flex items-center pl-3 py-1">
          <Typography>No files available for display.</Typography>
        </div>
      ) : !areFileDataLoading &&
        displayFiles.length === 0 &&
        fileBrowserState.uiErrorMsg ? (
        /* Error state */
        <div className="flex items-center pl-3 py-1">
          <Typography>{fileBrowserState.uiErrorMsg}</Typography>
        </div>
      ) : null}
      {showContextMenu ? (
        <ContextMenu
          menuRef={menuRef}
          setShowContextMenu={setShowContextMenu}
          setShowConvertFileDialog={setShowConvertFileDialog}
          setShowDeleteDialog={setShowDeleteDialog}
          setShowPermissionsDialog={setShowPermissionsDialog}
          setShowRenameDialog={setShowRenameDialog}
          showPropertiesDrawer={showPropertiesDrawer}
          togglePropertiesDrawer={togglePropertiesDrawer}
          x={contextMenuCoords.x}
          y={contextMenuCoords.y}
        />
      ) : null}
    </>
  );
}
