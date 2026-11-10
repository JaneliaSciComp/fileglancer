import { useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Typography } from '@material-tailwind/react';
import { useHotkey } from '@tanstack/react-hotkeys';
import toast from 'react-hot-toast';
import { useOutletContext } from 'react-router';

import Crumbs from './Crumbs';
import MetadataHint from './MetadataHint';
import ZarrPreview from './ZarrPreview';
import N5Preview from './N5Preview';
import Table from './FileTable';
import FileViewer from './FileViewer';
import SelectionBar from './SelectionBar';
import ContextMenu, {
  type ContextMenuItem
} from '@/components/ui/Menus/ContextMenu';
import { FileRowSkeleton } from '@/components/ui/widgets/Loaders';
import useContextMenu from '@/hooks/useContextMenu';
import useZarrMetadata from '@/hooks/useZarrMetadata';
import useN5Metadata from '@/hooks/useN5Metadata';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useCartContext } from '@/contexts/CartContext';
import type { OutletContextType } from '@/layouts/BrowseLayout';
import useHideDotFiles from '@/hooks/useHideDotFiles';
import { useHandleDownload } from '@/hooks/useHandleDownload';
import { useHandleView } from '@/hooks/useHandleView';
import {
  areZarrMetadataFilesPresent,
  useZarrbridgeStatusQuery,
  shouldRefreshListing,
  isPendingVirtualZarr
} from '@/queries/zarrQueries';
import { getBrowserRenderableType } from '@/utils/fileTypes';
import { detectN5, getN5DetectionSignals } from '@/queries/n5Queries';
import { makeMapKey } from '@/utils';
import { isReadOnlyFsp } from '@/utils/cloudStorage';
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
    updateFilesWithContextMenuClick,
    clearSelection
  } = useFileBrowserContext();
  const { folderPreferenceMap, handleContextMenuFavorite } =
    usePreferencesContext();
  const { addToCart } = useCartContext();
  const outlet = useOutletContext<OutletContextType | null | undefined>();
  const { displayFiles } = useHideDotFiles();
  const { handleDownload } = useHandleDownload();
  const { handleView } = useHandleView();

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
    availableZarrVersions
  } = useZarrMetadata();

  const { n5MetadataQuery, openWithToolUrls: n5OpenWithToolUrls } =
    useN5Metadata();

  const files = (fileQuery.data?.files ?? []) as FileOrFolder[];
  const currentName = fileQuery.data?.currentFileOrFolder?.name ?? '';
  const readOnly = isReadOnlyFsp(fileQuery.data?.currentFileSharePath);

  const isZarrDir = areZarrMetadataFilesPresent(files);
  // An image file (TIFF, MRC, ...) served as virtual OME-Zarr through
  // zarrbridge, or any group inside it: the backend flags every such node,
  // including the root while zarrbridge is still indexing it (no entries yet).
  const isVirtualZarr =
    fileQuery.data?.currentFileOrFolder?.virtual_zarr === true;
  const zarrbridgeStatusQuery = useZarrbridgeStatusQuery(
    fileQuery.data?.currentFileSharePath?.name,
    fileQuery.data?.currentFileOrFolder?.path,
    isVirtualZarr
  );
  const zarrbridgeState = zarrbridgeStatusQuery.data?.levels?.state;
  const pendingNodeState =
    fileQuery.data?.currentFileOrFolder?.zarrbridge_state;
  const prevZarrbridgeState = useRef<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const refetchListing = fileQuery.refetch;
  const metadataKey = [
    'zarr',
    'metadata',
    fileQuery.data?.currentFileSharePath?.name || '',
    fileQuery.data?.currentFileOrFolder?.path || ''
  ];
  // When zarrbridge finishes indexing or building, the listing (entries) and
  // zarr.json (levels) change under us: fetch the listing again, then mark the
  // metadata stale so an enabled metadata query refetches with the new files.
  // Never refetch the metadata directly: with no files yet it would cache an
  // empty result as fresh.
  useEffect(() => {
    const prev = prevZarrbridgeState.current;
    prevZarrbridgeState.current = zarrbridgeState;
    if (!shouldRefreshListing(prev, zarrbridgeState, pendingNodeState)) {
      return;
    }
    refetchListing().then(() => {
      queryClient.invalidateQueries({ queryKey: metadataKey });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zarrbridgeState, pendingNodeState]);
  const isN5Dir = detectN5(files);

  const hasZarrExt = currentName.endsWith('.zarr');
  const hasN5Ext = currentName.endsWith('.n5');

  const { hasAttributesJson, hasS0Folder } = getN5DetectionSignals(files);

  // 1st case Zarr hint req'd: query fired, no error, but no metadata returned (indicating a Zarr without expected metadata structure)
  const isZarrNullMetadata =
    isZarrDir &&
    !zarrMetadataQuery.isPending &&
    !zarrMetadataQuery.isError &&
    !!zarrMetadataQuery.data &&
    !zarrMetadataQuery.data.metadata;

  // Escape key clears row selection and reverts properties to current directory
  useHotkey('Escape', () => {
    clearSelection();
  });

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
        name: 'View',
        action: () => {
          const result = handleView();
          if (!result.success) {
            toast.error(`Error viewing file: ${result.error}`);
          }
        },
        shouldShow:
          !propertiesTarget.is_dir &&
          !propertiesTarget.is_symlink &&
          getBrowserRenderableType(propertiesTarget.name) !== null
      },
      {
        name: 'Download',
        action: () => {
          const result = handleDownload();
          if (!result.success) {
            toast.error(`Error downloading file: ${result.error}`);
          }
        },
        shouldShow:
          !fileBrowserState.selectedFiles[0]?.is_dir &&
          !fileBrowserState.selectedFiles[0]?.is_symlink
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
        shouldShow:
          fileBrowserState.selectedFiles[0]?.is_dir &&
          !fileBrowserState.selectedFiles[0].is_symlink
      },
      {
        name: 'Convert images to OME-Zarr',
        action: () => {
          setShowConvertFileDialog(true);
        },
        shouldShow:
          tasksEnabled &&
          fileBrowserState.selectedFiles[0]?.is_dir &&
          !fileBrowserState.selectedFiles[0]?.is_symlink &&
          !readOnly
      },
      {
        name: 'Add to cart',
        action: async () => {
          const file = fileBrowserState.selectedFiles[0];
          if (!file) {
            return;
          }
          try {
            await addToCart([
              {
                fsp_name: fileQuery.data?.currentFileSharePath?.name ?? '',
                path: file.path,
                label: file.name
              }
            ]);
            toast.success(`Added "${file.name}" to the cart`);
            outlet?.openDrawer('cart');
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            toast.error(
              `Error adding "${file.name}" to the cart: ${errorMessage}`
            );
          }
        },
        shouldShow:
          fileBrowserState.selectedFiles[0]?.is_dir &&
          !fileBrowserState.selectedFiles[0]?.is_symlink
      },
      {
        name: 'Rename',
        action: () => {
          setShowRenameDialog(true);
        },
        shouldShow: !readOnly
      },
      {
        name: 'Change permissions',
        action: () => {
          setShowPermissionsDialog(true);
        },
        shouldShow: !readOnly
      },
      {
        name: 'Delete',
        action: () => {
          setShowDeleteDialog(true);
        },
        color: 'text-error',
        shouldShow: !readOnly
      }
    ];
  };

  return (
    <>
      <Crumbs />
      {isVirtualZarr && zarrbridgeStatusQuery.isError ? (
        <MetadataHint
          variant={{
            case: 'virtual-zarr',
            state: 'error',
            reason: zarrbridgeStatusQuery.error?.message
          }}
        />
      ) : isVirtualZarr && zarrbridgeStatusQuery.data ? (
        <MetadataHint
          variant={{
            case: 'virtual-zarr',
            state: zarrbridgeState,
            reason: zarrbridgeStatusQuery.data.levels?.reason,
            progress: zarrbridgeStatusQuery.data.levels?.progress
          }}
        />
      ) : null}
      {isZarrDir && zarrMetadataQuery.isPending ? (
        <div className="flex shadow-sm rounded-md w-full min-h-96 bg-surface animate-appear animate-pulse animate-delay-150 opacity-0">
          <Typography className="place-self-center text-center w-full">
            Loading Zarr metadata...
          </Typography>
        </div>
      ) : zarrMetadataQuery.isError ? (
        <MetadataHint
          variant={{
            case: 'zarr-query-error',
            errorMessage: zarrMetadataQuery.error?.message
          }}
        />
      ) : isZarrDir && zarrMetadataQuery.data?.metadata ? (
        <ZarrPreview
          availableZarrVersions={availableZarrVersions}
          fspName={fileQuery.data?.currentFileSharePath?.name ?? ''}
          layerType={layerType}
          mainPanelWidth={mainPanelWidth}
          openWithToolUrls={openWithToolUrls}
          path={fileQuery.data?.currentFileOrFolder?.path ?? ''}
          thumbnailQuery={thumbnailQuery}
          zarrMetadataQuery={zarrMetadataQuery}
        />
      ) : isZarrNullMetadata ? (
        <MetadataHint
          variant={
            availableZarrVersions.includes(3)
              ? { case: 'zarr-v3-no-multiscales' }
              : { case: 'zarr-v2-no-multiscales' }
          }
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
        <MetadataHint
          variant={{
            case: 'n5-query-error',
            errorMessage: n5MetadataQuery.error?.message
          }}
        />
      ) : n5MetadataQuery.data ? (
        <N5Preview
          fspName={fileQuery.data?.currentFileSharePath?.name ?? ''}
          mainPanelWidth={mainPanelWidth}
          n5MetadataQuery={n5MetadataQuery}
          openWithToolUrls={n5OpenWithToolUrls}
          path={fileQuery.data?.currentFileOrFolder?.path ?? ''}
        />
      ) : null}

      {/* 2nd case N5/Zarr hints req'd: no detection fired, but directory has Zarr/N5 extension signals */}
      {!isZarrDir && !isN5Dir && !fileQuery.isPending && !!fileQuery.data ? (
        hasZarrExt ? (
          <MetadataHint variant={{ case: 'zarr-extension-no-markers' }} />
        ) : hasN5Ext && !hasAttributesJson && hasS0Folder ? (
          <MetadataHint variant={{ case: 'n5-has-s0-no-attrs' }} />
        ) : hasN5Ext && hasAttributesJson && !hasS0Folder ? (
          <MetadataHint variant={{ case: 'n5-has-attrs-no-s0' }} />
        ) : hasN5Ext && !hasAttributesJson && !hasS0Folder ? (
          <MetadataHint variant={{ case: 'n5-no-markers' }} />
        ) : null
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
      ) : isPendingVirtualZarr(fileQuery.data.currentFileOrFolder) ? (
        // zarrbridge is still indexing this image (or gave up): the hint
        // above says so; there is nothing to list and the bytes are not for
        // the file viewer. Leaves inside a virtual Zarr (zarr.json, chunks)
        // carry no state and fall through to the viewer below.
        <div className="pl-3 py-1" />
      ) : fileQuery.data.currentFileOrFolder &&
        !fileQuery.data.currentFileOrFolder.is_dir &&
        !isZarrDir ? (
        // If current item is a file, render the FileViewer instead of the file browser
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <div className="absolute inset-0">
            <FileViewer file={fileQuery.data.currentFileOrFolder} />
          </div>
        </div>
      ) : displayFiles.length > 0 ? (
        <div className="mt-3" data-tour="file-browser">
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
      <SelectionBar />
    </>
  );
}
