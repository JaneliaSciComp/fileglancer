import * as React from 'react';
import { Typography } from '@material-tailwind/react';

import type { FileOrFolder } from '@/shared.types';
import FileListCrumbs from './Crumbs';
import FileRow from './FileRow';
import ZarrPreview from './ZarrPreview';
import ContextMenu from '@/components/ui/Menus/ContextMenu';
import Loader from '@/components/ui/Loader';
import useContextMenu from '@/hooks/useContextMenu';
import useZarrMetadata from '@/hooks/useZarrMetadata';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';

type FileListProps = {
  selectedFiles: FileOrFolder[];
  setSelectedFiles: React.Dispatch<React.SetStateAction<FileOrFolder[]>>;
  showPropertiesDrawer: boolean;
  hideDotFiles: boolean;
  setShowPropertiesDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  setShowRenameDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDeleteDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowPermissionsDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowConvertFileDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function FileList({
  selectedFiles,
  setSelectedFiles,
  showPropertiesDrawer,
  hideDotFiles,
  setShowPropertiesDrawer,
  setShowRenameDialog,
  setShowDeleteDialog,
  setShowPermissionsDialog,
  setShowConvertFileDialog
}: FileListProps): React.ReactNode {
  const { files, isFileBrowserReady, fetchErrorMsg } = useFileBrowserContext();

  const {
    contextMenuCoords,
    showContextMenu,
    setShowContextMenu,
    menuRef,
    handleContextMenuClick,
    handleFavoriteToggleMenuItemClick
  } = useContextMenu();

  const {
    metadata,
    thumbnailSrc,
    openWithToolUrls,
    loadingThumbnail,
    thumbnailError
  } = useZarrMetadata();

  const displayFiles = React.useMemo(() => {
    return hideDotFiles
      ? files.filter(file => !file.name.startsWith('.'))
      : files;
  }, [files, hideDotFiles]);

  return (
    <div className="px-2 transition-all duration-300 flex flex-col h-full overflow-hidden">
      <FileListCrumbs />
      <div className="overflow-y-auto">
        {metadata ? (
          <ZarrPreview
            metadata={metadata}
            thumbnailSrc={thumbnailSrc}
            loadingThumbnail={loadingThumbnail}
            openWithToolUrls={openWithToolUrls}
            thumbnailError={thumbnailError}
          />
        ) : null}

        <div className="min-w-full bg-background select-none">
          {/* Header row */}
          <div className="min-w-fit grid grid-cols-[minmax(170px,2fr)_minmax(80px,1fr)_minmax(95px,1fr)_minmax(75px,1fr)_minmax(40px,1fr)] gap-4 p-0 text-foreground">
            <div className="flex w-full gap-3 px-3 py-1 overflow-x-auto">
              <Typography variant="small" className="font-bold">
                Name
              </Typography>
            </div>

            <Typography variant="small" className="font-bold overflow-x-auto">
              Type
            </Typography>

            <Typography variant="small" className="font-bold overflow-x-auto">
              Last Modified
            </Typography>

            <Typography variant="small" className="font-bold overflow-x-auto">
              Size
            </Typography>

            <Typography variant="small" className="font-bold overflow-x-auto">
              Actions
            </Typography>
          </div>
        </div>
        {/* File rows */}
        {isFileBrowserReady && displayFiles.length > 0 ? (
          displayFiles.map((file, index) => {
            return (
              <FileRow
                key={`${file.name}-${index}`}
                file={file}
                index={index}
                selectedFiles={selectedFiles}
                setSelectedFiles={setSelectedFiles}
                displayFiles={displayFiles}
                showPropertiesDrawer={showPropertiesDrawer}
                handleContextMenuClick={handleContextMenuClick}
              />
            );
          })
        ) : isFileBrowserReady &&
          displayFiles.length === 0 &&
          !fetchErrorMsg ? (
          <div className="flex items-center pl-3 py-1">
            <Typography className="text-primary-default">
              No files available for display.
            </Typography>
          </div>
        ) : isFileBrowserReady && displayFiles.length === 0 && fetchErrorMsg ? (
          <div className="flex items-center pl-3 py-1">
            <Typography className="text-primary-default">
              {fetchErrorMsg}
            </Typography>
          </div>
        ) : (
          <div className="flex justify-center w-full py-2">
            <Loader />
          </div>
        )}
      </div>
      {showContextMenu ? (
        <ContextMenu
          x={contextMenuCoords.x}
          y={contextMenuCoords.y}
          menuRef={menuRef}
          selectedFiles={selectedFiles}
          handleFavoriteToggleMenuItemClick={handleFavoriteToggleMenuItemClick}
          setShowPropertiesDrawer={setShowPropertiesDrawer}
          setShowContextMenu={setShowContextMenu}
          setShowRenameDialog={setShowRenameDialog}
          setShowDeleteDialog={setShowDeleteDialog}
          setShowPermissionsDialog={setShowPermissionsDialog}
          setShowConvertFileDialog={setShowConvertFileDialog}
        />
      ) : null}
    </div>
  );
}
