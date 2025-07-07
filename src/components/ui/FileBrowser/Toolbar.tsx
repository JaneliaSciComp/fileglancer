import * as React from 'react';
import {
  ButtonGroup,
  IconButton,
  Tooltip,
  Typography
} from '@material-tailwind/react';
import {
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
  FolderPlusIcon
} from '@heroicons/react/24/solid';
import { StarIcon as StarOutline } from '@heroicons/react/24/outline';
import { StarIcon as StarFilled } from '@heroicons/react/24/solid';
import { GoSidebarCollapse, GoSidebarExpand } from 'react-icons/go';

import type { FileOrFolder } from '@/shared.types';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { makeMapKey } from '@/utils';
import { handleFailure } from '@/utils/errorHandling';

type ToolbarProps = {
  selectedFiles: FileOrFolder[];
  hideDotFiles: boolean;
  setHideDotFiles: React.Dispatch<React.SetStateAction<boolean>>;
  showPropertiesDrawer: boolean;
  setShowPropertiesDrawer: React.Dispatch<React.SetStateAction<boolean>>;
  showSidebar: boolean;
  setShowSidebar: React.Dispatch<React.SetStateAction<boolean>>;
  setShowNewFolderDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function Toolbar({
  selectedFiles,
  hideDotFiles,
  setHideDotFiles,
  showPropertiesDrawer,
  setShowPropertiesDrawer,
  showSidebar,
  setShowSidebar,
  setShowNewFolderDialog
}: ToolbarProps): JSX.Element {
  const { currentFolder, currentFileSharePath, fetchAndSetFiles } =
    useFileBrowserContext();

  const {
    folderPreferenceMap,
    fileSharePathPreferenceMap,
    handleFavoriteChange
  } = usePreferencesContext();

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

  async function handleRefresh() {
    if (!currentFileSharePath) {
      return;
    }
    try {
      const response = await fetchAndSetFiles(
        currentFileSharePath.name,
        currentFolder?.path
      );
      if (!response.ok) {
        handleFailure('refreshing file browser', response);
      }
    } catch (error) {
      handleFailure('refreshing file browser', error);
    }
  }

  async function handleFavoriteClick() {
    if (!currentFileSharePath || !currentFolder) {
      return;
    }
    try {
      if (!currentFolder || currentFolder.path === '.') {
        const response = await handleFavoriteChange(
          currentFileSharePath,
          'fileSharePath'
        );
        if (!response.ok) {
          handleFailure('adding/removing file share path favorite', response);
        }
      } else {
        const response = await handleFavoriteChange(
          {
            type: 'folder',
            folderPath: currentFolder.path,
            fsp: currentFileSharePath
          },
          'folder'
        );
        if (!response.ok) {
          handleFailure('adding/removing folder favorite', response);
        }
      }
    } catch (error) {
      handleFailure('adding/removing folder favorite', error);
    }
  }

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
              onClick={() => handleRefresh()}
            >
              <ArrowPathIcon className="icon-default" />
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
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                setShowNewFolderDialog(true);
                e.currentTarget.blur();
              }}
            >
              <FolderPlusIcon className="icon-default" />
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
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                setHideDotFiles((prev: boolean) => !prev);
                e.currentTarget.blur();
              }}
            >
              {hideDotFiles ? (
                <EyeSlashIcon className="icon-default" />
              ) : (
                <EyeIcon className="icon-default" />
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
                disabled={!selectedFiles}
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  handleFavoriteClick();
                  e.currentTarget.blur();
                }}
              >
                {isFavorited ? (
                  <StarFilled className="icon-default" />
                ) : (
                  <StarOutline className="icon-default" />
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
