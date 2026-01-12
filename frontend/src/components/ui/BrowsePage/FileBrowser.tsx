import type { MouseEvent } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import Crumbs from './Crumbs';
import ZarrPreview from './ZarrPreview';
import N5Preview from './N5Preview';
import Table from './FileTable';
import FileViewer from './FileViewer';
import ContextMenu, {
  type ContextMenuItem
} from '@/components/ui/Menus/ContextMenu';
import { FileRowSkeleton } from '@/components/ui/widgets/Loaders';
import useContextMenu from '@/hooks/useContextMenu';
import useZarrMetadata from '@/hooks/useZarrMetadata';
import useN5Metadata from '@/hooks/useN5Metadata';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import useHideDotFiles from '@/hooks/useHideDotFiles';
import { useHandleDownload } from '@/hooks/useHandleDownload';
import { detectZarrVersions } from '@/queries/zarrQueries';
import { detectN5 } from '@/queries/n5Queries';
import { makeMapKey } from '@/utils';
import type { FileOrFolder } from '@/shared.types';

const tasksEnabled = import.meta.env.VITE_ENABLE_TASKS === 'true';

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
  const {
    fspName,
    fileQuery,
    fileBrowserState,
    updateFilesWithContextMenuClick
  } = useFileBrowserContext();
  const { folderPreferenceMap, handleContextMenuFavorite } =
    usePreferencesContext();
  const { displayFiles } = useHideDotFiles();
  const { handleDownload } = useHandleDownload();

  const {
    contextMenuCoords,
    showContextMenu,
    menuRef,
    openContextMenu,
    closeContextMenu
  } = useContextMenu();

  const {
    zarrMetadataQuery,
    thumbnailQuery,
    openWithToolUrls,
    layerType,
    availableVersions
  } = useZarrMetadata();

  const { n5MetadataQuery, openWithToolUrls: n5OpenWithToolUrls } =
    useN5Metadata();

  const isZarrDir =
    detectZarrVersions(fileQuery.data?.files as FileOrFolder[]).length > 0;

  const isN5Dir = detectN5(fileQuery.data?.files as FileOrFolder[]);

  // Handle right-click on file - FileBrowser-specific logic
  const handleFileContextMenu = (
    e: MouseEvent<HTMLDivElement>,
    file: FileOrFolder
  ) => {
    updateFilesWithContextMenuClick(file);
    openContextMenu(e);
  };

  // Build context menu items with pre-bound actions
  const getContextMenuItems = (): ContextMenuItem[] => {
    if (!fileBrowserState.propertiesTarget) {
      return [];
    }

    const propertiesTarget = fileBrowserState.propertiesTarget;
    const isFavorite = Boolean(
      fspName &&
        folderPreferenceMap[
          makeMapKey('folder', `${fspName}_${propertiesTarget.path}`)
        ]
    );

    return [
      {
        name: 'View file properties',
        action: () => {
          togglePropertiesDrawer();
        },
        shouldShow: !showPropertiesDrawer
      },
      {
        name: 'Download',
        action: () => {
          const result = handleDownload();
          if (!result.success) {
            toast.error(`Error downloading file: ${result.error}`);
          }
        },
        shouldShow: !propertiesTarget.is_dir
      },
      {
        name: isFavorite ? 'Unset favorite' : 'Set favorite',
        action: async () => {
          const result = await handleContextMenuFavorite();
          if (!result.success) {
            toast.error(`Error toggling favorite: ${result.error}`);
          } else {
            toast.success(`Favorite ${isFavorite ? 'removed!' : 'added!'}`);
          }
        },
        shouldShow: fileBrowserState.selectedFiles[0]?.is_dir ?? false
      },
      {
        name: 'Convert images to OME-Zarr',
        action: () => {
          setShowConvertFileDialog(true);
        },
        shouldShow: tasksEnabled && propertiesTarget.is_dir
      },
      {
        name: 'Rename',
        action: () => {
          setShowRenameDialog(true);
        },
        shouldShow: true
      },
      {
        name: 'Change permissions',
        action: () => {
          setShowPermissionsDialog(true);
        },
        shouldShow: !propertiesTarget.is_dir
      },
      {
        name: 'Delete',
        action: () => {
          setShowDeleteDialog(true);
        },
        color: 'text-red-600',
        shouldShow: true
      }
    ];
  };

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
          availableVersions={availableVersions}
          layerType={layerType}
          mainPanelWidth={mainPanelWidth}
          openWithToolUrls={openWithToolUrls}
          thumbnailQuery={thumbnailQuery}
          zarrMetadataQuery={zarrMetadataQuery}
        />
      ) : null}

      {/* N5 Preview */}
      {isN5Dir && n5MetadataQuery.isPending ? (
        <div className="flex shadow-sm rounded-md w-full min-h-96 bg-surface animate-appear animate-pulse animate-delay-150 opacity-0">
          <Typography className="place-self-center text-center w-full">
            Loading N5 metadata...
          </Typography>
        </div>
      ) : n5MetadataQuery.isError ? (
        <div className="flex shadow-sm rounded-md w-full min-h-96 bg-primary-light/30">
          <Typography className="place-self-center text-center w-full text-warning">
            Error loading N5 metadata
          </Typography>
        </div>
      ) : n5MetadataQuery.data ? (
        <N5Preview
          mainPanelWidth={mainPanelWidth}
          n5MetadataQuery={n5MetadataQuery}
          openWithToolUrls={n5OpenWithToolUrls}
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
          <Typography className="whitespace-pre-line">
            {fileQuery.error.message}
          </Typography>
        </div>
      ) : displayFiles.length === 0 && fileQuery.data.errorMessage ? (
        <div className="flex items-center pl-3 py-1">
          <Typography className="whitespace-pre-line">
            {fileQuery.data.errorMessage}
          </Typography>
        </div>
      ) : fileQuery.data.currentFileOrFolder &&
        !fileQuery.data.currentFileOrFolder.is_dir ? (
        // If current item is a file, render the FileViewer instead of the file browser
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <div className="absolute inset-0">
            <FileViewer file={fileQuery.data.currentFileOrFolder} />
          </div>
        </div>
      ) : displayFiles.length > 0 ? (
        <div data-tour="file-browser">
          <Table
            data={displayFiles}
            handleContextMenuClick={handleFileContextMenu}
            showPropertiesDrawer={showPropertiesDrawer}
          />
        </div>
      ) : displayFiles.length === 0 && !fileQuery.data.errorMessage ? (
        <div className="flex items-center pl-3 py-1">
          <Typography>No files available for display.</Typography>
        </div>
      ) : null}
      {showContextMenu && fileBrowserState.propertiesTarget ? (
        <ContextMenu
          items={getContextMenuItems()}
          menuRef={menuRef}
          onClose={closeContextMenu}
          x={contextMenuCoords.x}
          y={contextMenuCoords.y}
        />
      ) : null}
    </>
  );
}
