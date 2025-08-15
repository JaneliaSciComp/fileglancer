import * as React from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router';
import { ButtonGroup } from '@material-tailwind/react';
import {
  HiRefresh,
  HiEye,
  HiEyeOff,
  HiFolderAdd,
  HiOutlineClipboardCopy,
  HiHome,
  HiOutlineStar,
  HiStar
} from 'react-icons/hi';
import { GoSidebarCollapse, GoSidebarExpand } from 'react-icons/go';
import { IoNavigateCircleSharp } from 'react-icons/io5';

import FgTooltip from '@/components/ui/widgets/FgTooltip';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useProfileContext } from '@/contexts/ProfileContext';
import { useOpenFavoritesContext } from '@/contexts/OpenFavoritesContext';
import { getPreferredPathForDisplay, makeMapKey } from '@/utils';
import { copyToClipboard } from '@/utils/copyText';
import useFavoriteToggle from '@/hooks/useFavoriteToggle';

type ToolbarProps = {
  hideDotFiles: boolean;
  setHideDotFiles: React.Dispatch<React.SetStateAction<boolean>>;
  showPropertiesDrawer: boolean;
  setShowPropertiesDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  showSidebar: boolean;
  setShowSidebar: React.Dispatch<React.SetStateAction<boolean>>;
  setShowNewFolderDialog: React.Dispatch<React.SetStateAction<boolean>>;
  setShowNavigationDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function Toolbar({
  hideDotFiles,
  setHideDotFiles,
  showPropertiesDrawer,
  setShowPropertiesDrawer,
  showSidebar,
  setShowSidebar,
  setShowNewFolderDialog,
  setShowNavigationDialog
}: ToolbarProps): JSX.Element {
  const { currentFolder, currentFileSharePath, refreshFiles } =
    useFileBrowserContext();
  const { profile } = useProfileContext();
  const { folderPreferenceMap, fileSharePathPreferenceMap, pathPreference } =
    usePreferencesContext();
  const { handleFavoriteToggle } = useFavoriteToggle();
  const { openFavoritesSection } = useOpenFavoritesContext();

  const fullPath = getPreferredPathForDisplay(
    pathPreference,
    currentFileSharePath,
    currentFolder?.path
  );

  const isFavorited = React.useMemo(() => {
    if (!currentFileSharePath) {
      return false;
    }
    if (!currentFolder || currentFolder.path === '.') {
      const fspKey = makeMapKey('fsp', currentFileSharePath.name);
      return fspKey in fileSharePathPreferenceMap;
    }
    const folderKey = makeMapKey(
      'folder',
      `${currentFileSharePath.name}_${currentFolder.path}`
    );
    return folderKey in folderPreferenceMap;
  }, [
    currentFileSharePath,
    currentFolder,
    folderPreferenceMap,
    fileSharePathPreferenceMap
  ]);

  // Don't show favorite button if not in a valid location
  const showFavoriteButton: boolean = Boolean(
    currentFileSharePath && currentFolder && currentFolder.is_dir
  );

  const triggerClasses =
    'inline-grid place-items-center border align-middle select-none font-sans font-medium text-center transition-all duration-300 ease-in disabled:opacity-50 disabled:shadow-none disabled:pointer-events-none data-[shape=circular]:rounded-full text-sm min-w-[38px] min-h-[38px] rounded-md shadow-sm hover:shadow-md bg-transparent border-primary text-primary hover:bg-primary hover:text-primary-foreground outline-none group';

  return (
    <div className="flex flex-col min-w-full p-2 border-b border-surface">
      <div className="flex justify-between items-center">
        <ButtonGroup className="gap-1">
          {/* Show/hide favorites and zone browser sidebar */}
          <FgTooltip
            label={
              showSidebar
                ? 'Hide favorites and zone browser'
                : 'View favorites and zone browser'
            }
            icon={showSidebar ? GoSidebarExpand : GoSidebarCollapse}
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              setShowSidebar((prev: boolean) => !prev);
              e.currentTarget.blur();
            }}
            triggerClasses={triggerClasses}
          />

          {/* Go to home folder */}
          <FgTooltip
            as={Link}
            link={`/browse/${profile?.homeFileSharePathName}/${profile?.homeDirectoryName}`}
            icon={HiHome}
            label="Go to home folder"
            triggerClasses={triggerClasses}
          />

          {/* Open navigate dialog */}
          <FgTooltip
            icon={IoNavigateCircleSharp}
            label="Navigate to a path"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              setShowNavigationDialog(true);
              e.currentTarget.blur();
            }}
            triggerClasses={triggerClasses}
          />

          {/* Refresh browser contents */}
          <FgTooltip
            icon={HiRefresh}
            label="Refresh file browser"
            disabledCondition={!currentFileSharePath}
            onClick={async () => {
              if (!currentFileSharePath) {
                toast.error(
                  'Cannot refresh files - no file share path selected.'
                );
              }
              const result = await refreshFiles();
              if (result.success) {
                toast.success('File browser refreshed!');
              } else {
                toast.error(`Error refreshing file browser: ${result.error}`);
              }
            }}
            triggerClasses={triggerClasses}
          />

          {/* Make new folder */}
          <FgTooltip
            icon={HiFolderAdd}
            label="New folder"
            disabledCondition={!currentFileSharePath}
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              setShowNewFolderDialog(true);
              e.currentTarget.blur();
            }}
            triggerClasses={triggerClasses}
          />

          {/* Show/hide dot files and folders */}
          <FgTooltip
            icon={hideDotFiles ? HiEyeOff : HiEye}
            label={hideDotFiles ? 'Show dot files' : 'Hide dot files'}
            disabledCondition={!currentFileSharePath}
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              setHideDotFiles((prev: boolean) => !prev);
              e.currentTarget.blur();
            }}
            triggerClasses={triggerClasses}
          />

          {/* Add/remove current folder from favorites */}
          {showFavoriteButton ? (
            <FgTooltip
              icon={isFavorited ? HiStar : HiOutlineStar}
              label={
                isFavorited
                  ? 'Remove current directory from favorites'
                  : 'Add current directory to favorites'
              }
              disabledCondition={!currentFileSharePath}
              onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
                const result = await handleFavoriteToggle(false);
                if (!result.success) {
                  toast.error(`Error updating favorites: ${result.error}`);
                } else if (result.data === true) {
                  openFavoritesSection();
                  toast.success('Favorite added!');
                } else {
                  toast.success('Favorite removed!');
                }
              }}
              triggerClasses={triggerClasses}
            />
          ) : null}

          {/* Copy path */}
          <FgTooltip
            icon={HiOutlineClipboardCopy}
            label="Copy current path"
            disabledCondition={!currentFileSharePath}
            onClick={() => {
              try {
                copyToClipboard(fullPath);
                toast.success('Path copied to clipboard!');
              } catch (error) {
                toast.error(`Failed to copy path. Error: ${error}`);
              }
            }}
            triggerClasses={triggerClasses}
          />
        </ButtonGroup>

        {/* Show/hide properties drawer */}
        <FgTooltip
          icon={showPropertiesDrawer ? GoSidebarCollapse : GoSidebarExpand}
          label={
            showPropertiesDrawer
              ? 'Hide file properties'
              : 'View file properties'
          }
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            setShowPropertiesDrawer((prev: boolean) => !prev);
            e.currentTarget.blur();
          }}
          triggerClasses={triggerClasses}
        />
      </div>
    </div>
  );
}
