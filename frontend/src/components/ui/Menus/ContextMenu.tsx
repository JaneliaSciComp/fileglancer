import type { Dispatch, SetStateAction, RefObject } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';

import FgMenuItems, { MenuItem } from './FgMenuItems';
import type { Result } from '@/shared.types';
import { makeMapKey } from '@/utils';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { useHandleDownload } from '@/hooks/useHandleDownload';

type ContextMenuProps = {
  readonly x: number;
  readonly y: number;
  readonly menuRef: RefObject<HTMLDivElement | null>;
  readonly showPropertiesDrawer: boolean;
  readonly togglePropertiesDrawer: () => void;
  readonly setShowContextMenu: Dispatch<SetStateAction<boolean>>;
  readonly setShowRenameDialog: Dispatch<SetStateAction<boolean>>;
  readonly setShowDeleteDialog: Dispatch<SetStateAction<boolean>>;
  readonly setShowPermissionsDialog: Dispatch<SetStateAction<boolean>>;
  readonly setShowConvertFileDialog: Dispatch<SetStateAction<boolean>>;
};

type ContextMenuActionProps = {
  handleContextMenuFavorite: () => Promise<Result<boolean>>;
  handleDownload: () => Result<void>;
  togglePropertiesDrawer: () => void;
  setShowContextMenu: Dispatch<SetStateAction<boolean>>;
  setShowRenameDialog: Dispatch<SetStateAction<boolean>>;
  setShowDeleteDialog: Dispatch<SetStateAction<boolean>>;
  setShowPermissionsDialog: Dispatch<SetStateAction<boolean>>;
  setShowConvertFileDialog: Dispatch<SetStateAction<boolean>>;
};

const tasksEnabled = import.meta.env.VITE_ENABLE_TASKS === 'true';

export default function ContextMenu({
  x,
  y,
  menuRef,
  showPropertiesDrawer,
  togglePropertiesDrawer,
  setShowContextMenu,
  setShowRenameDialog,
  setShowDeleteDialog,
  setShowPermissionsDialog,
  setShowConvertFileDialog
}: ContextMenuProps) {
  const { fspName, fileBrowserState } = useFileBrowserContext();
  const { folderPreferenceMap, handleContextMenuFavorite } =
    usePreferencesContext();
  const { handleDownload } = useHandleDownload();

  if (!fileBrowserState.propertiesTarget) {
    return <>{toast.error('No target file selected')}</>; // No target file available
  }

  const isFavorite: boolean = Boolean(
    fspName &&
      folderPreferenceMap[
        makeMapKey(
          'folder',
          `${fspName}_${fileBrowserState.propertiesTarget.path}`
        )
      ]
  );

  const menuItems: MenuItem<ContextMenuActionProps>[] = [
    {
      name: 'View file properties',
      action: (props: ContextMenuActionProps) => {
        props.togglePropertiesDrawer();
        props.setShowContextMenu(false);
      },
      shouldShow: !showPropertiesDrawer
    },
    {
      name: 'Download',
      action: (props: ContextMenuActionProps) => {
        const result = props.handleDownload();
        if (!result.success) {
          toast.error(`Error downloading file: ${result.error}`);
        }
        props.setShowContextMenu(false);
      },
      shouldShow: !fileBrowserState.propertiesTarget.is_dir
    },
    {
      name: isFavorite ? 'Unset favorite' : 'Set favorite',
      action: async (props: ContextMenuActionProps) => {
        const result = await props.handleContextMenuFavorite();
        if (!result.success) {
          toast.error(`Error toggling favorite: ${result.error}`);
        } else {
          toast.success(`Favorite ${isFavorite ? 'removed!' : 'added!'}`);
        }
        setShowContextMenu(false);
      },
      shouldShow: fileBrowserState.selectedFiles[0].is_dir
    },
    {
      name: 'Convert images to OME-Zarr',
      action: (props: ContextMenuActionProps) => {
        setShowConvertFileDialog(true);
        props.setShowContextMenu(false);
      },
      shouldShow: tasksEnabled && fileBrowserState.propertiesTarget.is_dir
    },
    {
      name: 'Rename',
      action: (props: ContextMenuActionProps) => {
        props.setShowRenameDialog(true);
        props.setShowContextMenu(false);
      },
      shouldShow: true
    },
    {
      name: 'Change permissions',
      action: (props: ContextMenuActionProps) => {
        props.setShowPermissionsDialog(true);
        props.setShowContextMenu(false);
      },
      shouldShow: !fileBrowserState.propertiesTarget.is_dir
    },
    {
      name: 'Delete',
      action: (props: ContextMenuActionProps) => {
        props.setShowDeleteDialog(true);
        props.setShowContextMenu(false);
      },
      color: 'text-red-600',
      shouldShow: true
    }
  ];

  const actionProps = {
    fileBrowserState,
    handleDownload,
    handleContextMenuFavorite,
    togglePropertiesDrawer,
    setShowContextMenu,
    setShowRenameDialog,
    setShowDeleteDialog,
    setShowPermissionsDialog,
    setShowConvertFileDialog
  };

  return createPortal(
    <div
      className="fixed z-[9999] min-w-40 rounded-lg space-y-0.5 border border-surface bg-background p-1"
      ref={menuRef}
      style={{
        left: `${x}px`,
        top: `${y}px`
      }}
    >
      <FgMenuItems<ContextMenuActionProps>
        actionProps={actionProps}
        menuItems={menuItems}
      />
    </div>,

    document.body // Render context menu directly to body
  );
}
