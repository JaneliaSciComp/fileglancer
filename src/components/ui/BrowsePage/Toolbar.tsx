import * as React from 'react';
import toast from 'react-hot-toast';
import {
  ButtonGroup,
  IconButton,
  Tooltip,
  Typography
} from '@material-tailwind/react';
import {
  HiRefresh,
  HiEye,
  HiEyeOff,
  HiFolderAdd,
  HiOutlineClipboardCopy,
  HiOutlineStar,
  HiStar
} from 'react-icons/hi';
import { GoSidebarCollapse, GoSidebarExpand } from 'react-icons/go';

import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { getPreferredPathForDisplay, makeMapKey } from '@/utils';
import { copyToClipboard } from '@/utils/copyText';

type ToolbarProps = {
  hideDotFiles: boolean;
  setHideDotFiles: React.Dispatch<React.SetStateAction<boolean>>;
  showPropertiesDrawer: boolean;
  setShowPropertiesDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  showSidebar: boolean;
  setShowSidebar: React.Dispatch<React.SetStateAction<boolean>>;
  setShowNewFolderDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function Toolbar({
  hideDotFiles,
  setHideDotFiles,
  showPropertiesDrawer,
  setShowPropertiesDrawer,
  showSidebar,
  setShowSidebar,
  setShowNewFolderDialog
}: ToolbarProps): JSX.Element {
  const { currentFolder, currentFileSharePath, refreshFiles } =
    useFileBrowserContext();

  const {
    folderPreferenceMap,
    fileSharePathPreferenceMap,
    pathPreference,
    handleFavoriteChange
  } = usePreferencesContext();

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

  const handleFavoriteClick = React.useCallback(async () => {
    if (!currentFileSharePath || !currentFolder) {
      return;
    }
    if (!currentFolder || currentFolder.path === '.') {
      await handleFavoriteChange(currentFileSharePath, 'fileSharePath');
      return;
    } else {
      await handleFavoriteChange(
        {
          type: 'folder',
          folderPath: currentFolder.path,
          fsp: currentFileSharePath
        },
        'folder'
      );
    }
  }, [currentFolder, currentFileSharePath, handleFavoriteChange]);

  // Don't show favorite button if not in a valid location
  const showFavoriteButton =
    currentFileSharePath && currentFolder && currentFolder.is_dir;

  return (
    <div className="flex flex-col min-w-full p-2 border-b border-surface">
      <div className="flex justify-between items-center">
        <ButtonGroup className="gap-1">
          {/* Show/hide favorites and zone browser sidebar */}
          <Tooltip placement="top">
            <Tooltip.Trigger
              as={IconButton}
              variant="outline"
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                setShowSidebar((prev: boolean) => !prev);
                e.currentTarget.blur();
              }}
            >
              {showSidebar ? (
                <>
                  <GoSidebarCollapse className="icon-default scale-x-[-1]" />
                  <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
                    <Typography type="small" className="opacity-90">
                      Hide favorites and zone browser
                    </Typography>
                    <Tooltip.Arrow />
                  </Tooltip.Content>
                </>
              ) : (
                <>
                  <GoSidebarExpand className="icon-default scale-x-[-1]" />
                  <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
                    <Typography type="small" className="opacity-90">
                      View favorites and zone browser
                    </Typography>
                    <Tooltip.Arrow />
                  </Tooltip.Content>
                </>
              )}
            </Tooltip.Trigger>
          </Tooltip>

          {/* Refresh browser contents */}
          <Tooltip placement="top">
            <Tooltip.Trigger
              as={IconButton}
              variant="outline"
              disabled={!currentFileSharePath}
              onClick={async () => {
                if (!currentFileSharePath) {
                  return;
                }
                await refreshFiles();
              }}
            >
              <HiRefresh className="icon-default" />
              <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
                <Typography type="small" className="opacity-90">
                  Refresh file browser
                </Typography>
                <Tooltip.Arrow />
              </Tooltip.Content>
            </Tooltip.Trigger>
          </Tooltip>

          {/* Make new folder */}
          <Tooltip placement="top">
            <Tooltip.Trigger
              as={IconButton}
              variant="outline"
              disabled={!currentFileSharePath}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                setShowNewFolderDialog(true);
                e.currentTarget.blur();
              }}
            >
              <HiFolderAdd className="icon-default" />
            </Tooltip.Trigger>
            <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
              <Typography type="small" className="opacity-90">
                New folder
              </Typography>
              <Tooltip.Arrow />
            </Tooltip.Content>
          </Tooltip>

          {/* Show/hide dot files and folders */}
          <Tooltip placement="top">
            <Tooltip.Trigger
              as={IconButton}
              variant="outline"
              disabled={!currentFileSharePath}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                setHideDotFiles((prev: boolean) => !prev);
                e.currentTarget.blur();
              }}
            >
              {hideDotFiles ? (
                <HiEyeOff className="icon-default" />
              ) : (
                <HiEye className="icon-default" />
              )}
              <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
                <Typography type="small" className="opacity-90">
                  {hideDotFiles ? 'Show dot files' : 'Hide dot files'}
                </Typography>
                <Tooltip.Arrow />
              </Tooltip.Content>
            </Tooltip.Trigger>
          </Tooltip>

          {/* Add/remove current folder from favorites */}
          {showFavoriteButton && (
            <Tooltip placement="top">
              <Tooltip.Trigger
                as={IconButton}
                variant="outline"
                disabled={!currentFileSharePath}
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  handleFavoriteClick();
                  e.currentTarget.blur();
                }}
              >
                {isFavorited ? (
                  <HiStar className="icon-default" />
                ) : (
                  <HiOutlineStar className="icon-default" />
                )}
                <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
                  <Typography type="small" className="opacity-90">
                    {isFavorited
                      ? 'Remove current directory from favorites'
                      : 'Add current directory to favorites'}
                  </Typography>
                  <Tooltip.Arrow />
                </Tooltip.Content>
              </Tooltip.Trigger>
            </Tooltip>
          )}

          {/* Copy path */}
          <Tooltip placement="top">
            <Tooltip.Trigger
              as={IconButton}
              variant="outline"
              disabled={!currentFileSharePath}
              onClick={() => {
                try {
                  copyToClipboard(fullPath);
                  toast.success('Path copied to clipboard!');
                } catch (error) {
                  toast.error(`Failed to copy path. Error: ${error}`);
                }
              }}
            >
              <HiOutlineClipboardCopy className="icon-default" />
              <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
                <Typography type="small" className="opacity-90">
                  Copy current path
                </Typography>
                <Tooltip.Arrow />
              </Tooltip.Content>
            </Tooltip.Trigger>
          </Tooltip>
        </ButtonGroup>

        {/* Show/hide properties drawer */}
        <Tooltip placement="top">
          <Tooltip.Trigger
            as={IconButton}
            variant="outline"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              setShowPropertiesDrawer((prev: boolean) => !prev);
              e.currentTarget.blur();
            }}
          >
            {showPropertiesDrawer ? (
              <>
                <GoSidebarCollapse className="icon-default" />
                <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
                  <Typography type="small" className="opacity-90">
                    Hide file properties
                  </Typography>
                  <Tooltip.Arrow />
                </Tooltip.Content>
              </>
            ) : (
              <>
                <GoSidebarExpand className="icon-default" />
                <Tooltip.Content className="px-2.5 py-1.5 text-primary-foreground">
                  <Typography type="small" className="opacity-90">
                    View file properties
                  </Typography>
                  <Tooltip.Arrow />
                </Tooltip.Content>
              </>
            )}
          </Tooltip.Trigger>
        </Tooltip>
      </div>
    </div>
  );
}
