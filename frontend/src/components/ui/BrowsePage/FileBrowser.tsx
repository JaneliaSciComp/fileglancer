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
  readonly mainPanelWidth: number;
  readonly setShowRenameDialog: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setShowDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setShowPermissionsDialog: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  readonly setShowConvertFileDialog: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  readonly showPropertiesDrawer: boolean;
  readonly togglePropertiesDrawer: () => void;
};

export default function FileBrowser({
  mainPanelWidth,
  setShowRenameDialog,
  setShowDeleteDialog,
  setShowPermissionsDialog,
  setShowConvertFileDialog,
  showPropertiesDrawer,
  togglePropertiesDrawer
}: FileBrowserProps) {
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

  return (
    <>
      <Crumbs />
      {isZarrDir && zarrMetadataQuery.isPending ? (
        <div className="flex shadow-sm rounded-md w-full min-h-96 bg-surface animate-appear animate-pulse animate-delay-150 opacity-0">
          <Typography className="place-self-center text-center w-full">
            Loading Zarr metadata...
          </Typography>
        </div>
      ) : zarrMetadataQuery.isError ? (
        <div className="flex shadow-sm rounded-md w-full min-h-96 bg-primary-light/30">
          <Typography className="place-self-center text-center w-full text-warning">
            Error loading Zarr metadata
          </Typography>
        </div>
      ) : zarrMetadataQuery.data?.metadata ? (
        <ZarrPreview
          layerType={layerType}
          mainPanelWidth={mainPanelWidth}
          openWithToolUrls={openWithToolUrls}
          thumbnailQuery={thumbnailQuery}
          zarrMetadataQuery={zarrMetadataQuery}
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
      ) : displayFiles.length === 0 && fileQuery.data.errorMessage ? (
        <div className="flex items-center pl-3 py-1">
          <Typography>{fileQuery.data.errorMessage}</Typography>
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
      ) : displayFiles.length === 0 && !fileQuery.data.errorMessage ? (
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
