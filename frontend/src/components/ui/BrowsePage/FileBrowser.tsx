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
  const { fileQuery } = useFileBrowserContext();
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
      {fileQuery.isPending ? (
        <div className="min-w-full bg-background select-none">
          {Array.from({ length: 10 }, (_, index) => (
            <FileRowSkeleton key={index} />
          ))}
        </div>
      ) : fileQuery.isError ? (
        <div className="flex items-center pl-3 py-1">
          <Typography>{fileQuery.error.message}</Typography>
        </div>
      ) : fileQuery.data.currentFileOrFolder &&
        !fileQuery.data.currentFileOrFolder.is_dir ? (
        // If current item is a file, render the FileViewer instead of the file browser
        <FileViewer file={fileQuery.data.currentFileOrFolder} />
      ) : displayFiles.length > 0 ? (
        <Table
          data={displayFiles}
          handleContextMenuClick={handleContextMenuClick}
          showPropertiesDrawer={showPropertiesDrawer}
        />
      ) : displayFiles.length === 0 ? (
        <div className="flex items-center pl-3 py-1">
          <Typography>No files available for display.</Typography>
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
