import * as React from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router';
import { ButtonGroup } from '@material-tailwind/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  HiRefresh,
  HiEye,
  HiEyeOff,
  HiOutlineClipboardCopy,
  HiHome,
  HiOutlineStar,
  HiStar
} from 'react-icons/hi';
import { GoSidebarCollapse, GoSidebarExpand } from 'react-icons/go';

import FgTooltip from '@/components/ui/widgets/FgTooltip';
import NavigationButton from './NavigationButton';
import NewFolderButton from './NewFolderButton';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useProfileContext } from '@/contexts/ProfileContext';
import { useOpenFavoritesContext } from '@/contexts/OpenFavoritesContext';
import {
  getPreferredPathForDisplay,
  makeBrowseLink,
  makeMapKey
} from '@/utils';
import { copyToClipboard } from '@/utils/copyText';
import useFavoriteToggle from '@/hooks/useFavoriteToggle';
import { fileQueryKeys } from '@/queries/fileQueries';
import { fileContentQueryKeys } from '@/queries/fileContentQueries';

type ToolbarProps = {
  readonly showPropertiesDrawer: boolean;
  readonly togglePropertiesDrawer: () => void;
  readonly showSidebar: boolean;
  readonly toggleSidebar: () => void;
};

export default function Toolbar({
  showPropertiesDrawer,
  togglePropertiesDrawer,
  showSidebar,
  toggleSidebar
}: ToolbarProps): React.JSX.Element {
  const { fileBrowserState, fileQuery, fspName, filePath } =
    useFileBrowserContext();
  const queryClient = useQueryClient();

  const currentFileSharePath = fileBrowserState.uiFileSharePath;
  const currentFileOrFolder = fileQuery.data?.currentFileOrFolder;
  const { profile } = useProfileContext();
  const {
    folderPreferenceMap,
    fileSharePathPreferenceMap,
    pathPreference,
    hideDotFiles,
    toggleHideDotFiles
  } = usePreferencesContext();
  const { handleFavoriteToggle } = useFavoriteToggle();
  const { openFavoritesSection } = useOpenFavoritesContext();

  const fullPath = getPreferredPathForDisplay(
    pathPreference,
    currentFileSharePath,
    currentFileOrFolder?.path
  );

  const isFavorited = React.useMemo(() => {
    if (!currentFileSharePath) {
      return false;
    }
    if (!currentFileOrFolder || currentFileOrFolder.path === '.') {
      const fspKey = makeMapKey('fsp', currentFileSharePath.name);
      return fspKey in fileSharePathPreferenceMap;
    }
    const folderKey = makeMapKey(
      'folder',
      `${currentFileSharePath.name}_${currentFileOrFolder.path}`
    );
    return folderKey in folderPreferenceMap;
  }, [
    currentFileSharePath,
    currentFileOrFolder,
    folderPreferenceMap,
    fileSharePathPreferenceMap
  ]);

  const isFolder: boolean = Boolean(
    currentFileSharePath && currentFileOrFolder && currentFileOrFolder.is_dir
  );

  const triggerClasses =
    'inline-grid place-items-center border align-middle select-none font-sans font-medium text-center transition-all duration-300 ease-in disabled:opacity-50 disabled:shadow-none disabled:pointer-events-none data-[shape=circular]:rounded-full text-sm min-w-[38px] min-h-[38px] rounded-md shadow-sm hover:shadow-md bg-transparent border-primary text-primary hover:bg-primary hover:text-primary-foreground outline-none group';

  return (
    <div className="flex flex-col min-w-full p-2 border-b border-surface">
      <div className="flex justify-between items-center">
        <ButtonGroup className="gap-1">
          {/* Show/hide favorites and zone browser sidebar */}
          <FgTooltip
            icon={showSidebar ? GoSidebarExpand : GoSidebarCollapse}
            label={
              showSidebar
                ? 'Hide favorites and zone browser'
                : 'View favorites and zone browser'
            }
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              toggleSidebar();
              e.currentTarget.blur();
            }}
            triggerClasses={triggerClasses}
          />

          {/* Go to home folder */}
          <FgTooltip
            as={Link}
            icon={HiHome}
            label="Go to home folder"
            link={makeBrowseLink(
              profile?.homeFileSharePathName,
              profile?.homeDirectoryName
            )}
            triggerClasses={triggerClasses}
          />

          {/* Open navigate dialog */}
          <NavigationButton triggerClasses={triggerClasses} />

          {/* Refresh browser contents */}
          {currentFileSharePath ? (
            <FgTooltip
              icon={HiRefresh}
              label="Refresh file browser"
              onClick={async () => {
                // Check if we're viewing a file or a folder
                const isViewingFile =
                  currentFileOrFolder && !currentFileOrFolder.is_dir;

                if (isViewingFile && fspName && filePath) {
                  // If viewing a file, invalidate file content query
                  await queryClient.invalidateQueries({
                    queryKey: fileContentQueryKeys.detail(fspName, filePath)
                  });
                  toast.success('File content refreshed!');
                } else if (fspName && filePath) {
                  // If viewing a folder, invalidate file list query
                  await queryClient.invalidateQueries({
                    queryKey: fileQueryKeys.filePath(fspName, filePath)
                  });
                  toast.success('File browser refreshed!');
                }
              }}
              triggerClasses={triggerClasses}
            />
          ) : null}

          {/* Make new folder */}
          {isFolder ? (
            <NewFolderButton triggerClasses={triggerClasses} />
          ) : null}

          {/* Show/hide dot files */}
          {isFolder ? (
            <FgTooltip
              icon={hideDotFiles ? HiEyeOff : HiEye}
              label={hideDotFiles ? 'Show dot files' : 'Hide dot files'}
              onClick={async (e: React.MouseEvent<HTMLButtonElement>) => {
                const result = await toggleHideDotFiles();
                if (result.success) {
                  toast.success(
                    hideDotFiles
                      ? 'Dot files are now visible'
                      : 'Dot files are now hidden'
                  );
                } else {
                  toast.error(result.error);
                }
                e.currentTarget.blur();
              }}
              triggerClasses={triggerClasses}
            />
          ) : null}

          {/* Add/remove current folder from favorites */}
          {isFolder ? (
            <FgTooltip
              icon={isFavorited ? HiStar : HiOutlineStar}
              label={
                isFavorited
                  ? 'Remove current directory from favorites'
                  : 'Add current directory to favorites'
              }
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
          {currentFileSharePath ? (
            <FgTooltip
              icon={HiOutlineClipboardCopy}
              label="Copy current path"
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
          ) : null}
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
            togglePropertiesDrawer();
            e.currentTarget.blur();
          }}
          triggerClasses={triggerClasses}
        />
      </div>
    </div>
  );
}
