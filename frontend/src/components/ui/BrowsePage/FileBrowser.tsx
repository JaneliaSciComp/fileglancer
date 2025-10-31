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
import { isZarrDirectory } from '@/queries/zarrQueries';

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

  const { zarrMetadataQuery, thumbnailQuery, openWithToolUrls, layerType } =
    useZarrMetadata();

  const isZarrDir = isZarrDirectory(fileQuery.data?.files);

  const currentFileOrFolder = fileQuery.data?.currentFileOrFolder;
  const isLoading = fileQuery.isPending;
  const error = fileQuery.error;

  // If current item is a file, render the FileViewer instead of the file browser
  if (currentFileOrFolder && !currentFileOrFolder.is_dir) {
    return <FileViewer file={currentFileOrFolder} />;
  }

  return (
    <>
      <Crumbs />
      {isZarrDir && zarrMetadataQuery.isPending ? (
        <div className="flex my-4 shadow-sm rounded-md w-full min-h-96 bg-surface animate-appear animate-pulse animate-delay-150 opacity-0">
          <Typography className="place-self-center text-center w-full">
            Loading Zarr metadata...
          </Typography>
        </div>
      ) : zarrMetadataQuery.isError ? (
        <div className="flex my-4 shadow-sm rounded-md w-full min-h-96 bg-primary-light/30">
          <Typography className="place-self-center text-center w-full text-warning">
            Error loading Zarr metadata
          </Typography>
        </div>
      ) : zarrMetadataQuery.data?.metadata ? (
        <ZarrPreview
          layerType={layerType}
          metadata={zarrMetadataQuery.data.metadata}
          openWithToolUrls={openWithToolUrls}
          thumbnailQuery={thumbnailQuery}
        />
      ) : null}

      {/* Loading state */}
      {isLoading ? (
        <div className="min-w-full bg-background select-none">
          {Array.from({ length: 10 }, (_, index) => (
            <FileRowSkeleton key={index} />
          ))}
        </div>
      ) : !isLoading && displayFiles.length > 0 ? (
        <Table
          data={displayFiles}
          handleContextMenuClick={handleContextMenuClick}
          showPropertiesDrawer={showPropertiesDrawer}
        />
      ) : !isLoading && displayFiles.length === 0 && !error ? (
        <div className="flex items-center pl-3 py-1">
          <Typography>No files available for display.</Typography>
        </div>
      ) : !isLoading && displayFiles.length === 0 && error ? (
        /* Error state */
        <div className="flex items-center pl-3 py-1">
          <Typography>{error.message}</Typography>
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
