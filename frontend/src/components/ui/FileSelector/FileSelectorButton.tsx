import { useState, useEffect } from 'react';
import type { ChangeEvent, FormEvent, KeyboardEvent, MouseEvent } from 'react';
import { IconButton, Input, Typography } from '@material-tailwind/react';
import { HiOutlineFolder, HiOutlineFunnel, HiXMark } from 'react-icons/hi2';
import { HiHome, HiFolderAdd, HiEye, HiEyeOff } from 'react-icons/hi';
import toast from 'react-hot-toast';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import FgInput from '@/components/designSystem/atoms/formElements/FgInput';
import FileSelectorBreadcrumbs from './FileSelectorBreadcrumbs';
import FileSelectorTable from './FileSelectorTable';
import { Spinner } from '@/components/ui/widgets/Loaders';
import useFileSelector from '@/hooks/useFileSelector';
import useFileNameValidation from '@/hooks/useFileNameValidation';
import { useCreateFolderMutation } from '@/queries/fileQueries';
import { joinPaths } from '@/utils';
import type {
  FileSelectorInitialLocation,
  FileSelectorMode
} from '@/hooks/useFileSelector';

// Remember the last confirmed selection's parent folder across all instances
let lastSelectedParentPath: string | null = null;

function getParentPath(fullPath: string): string {
  // Strip trailing slash, then take everything up to the last separator
  const trimmed = fullPath.replace(/[\\/]+$/, '');
  const lastSep = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return lastSep > 0 ? trimmed.slice(0, lastSep) : trimmed;
}

type FileSelectorButtonProps = {
  readonly onSelect: (path: string, displayPath: string) => void;
  readonly triggerClasses?: string;
  readonly label?: string;
  readonly initialLocation?: FileSelectorInitialLocation;
  readonly mode?: FileSelectorMode;
  readonly useServerPath?: boolean;
  readonly initialPath?: string;
  readonly defaultToHome?: boolean;
};

// Icon-button styling matched to the file browser toolbar.
const toolbarBtnClasses =
  'inline-grid place-items-center border align-middle select-none font-sans font-medium text-center transition-all duration-300 ease-in disabled:opacity-50 disabled:shadow-none disabled:pointer-events-none data-[shape=circular]:rounded-full text-sm min-w-[38px] min-h-[38px] rounded-md shadow-sm hover:shadow-md bg-transparent border-primary text-primary hover:bg-primary hover:text-primary-foreground outline-none group';

export default function FileSelectorButton({
  onSelect,
  triggerClasses = '',
  label = 'Browse...',
  initialLocation,
  mode = 'any',
  useServerPath,
  initialPath,
  defaultToHome = false
}: FileSelectorButtonProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  // Editable path field: local while typing, kept in sync with the current
  // selection/location so pasting a path can navigate the browser there.
  const [pathInput, setPathInput] = useState('');

  // Use initialPath if provided, otherwise fall back to last confirmed selection's parent
  const effectiveInitialPath =
    initialPath || lastSelectedParentPath || undefined;

  const {
    state,
    displayItems,
    fileQuery,
    zonesQuery,
    navigateToLocation,
    navigateToRawPath,
    navigateHome,
    canGoHome,
    currentPathDisplay,
    selectItem,
    handleItemDoubleClick,
    reset,
    searchQuery,
    handleSearchChange,
    clearSearch,
    isFilteredByGroups,
    userHasGroups,
    hideDotFiles,
    toggleHideDotFiles
  } = useFileSelector({
    initialLocation,
    initialPath: showDialog ? effectiveInitialPath : undefined,
    mode,
    pathPreferenceOverride: useServerPath ? ['linux_path'] : undefined,
    defaultToHome
  });

  const createFolderMutation = useCreateFolderMutation();
  const nameValidation = useFileNameValidation(newFolderName);

  // New folders can only be made inside a file share (not at the zones/zone level).
  const currentFilesystem =
    state.currentLocation.type === 'filesystem' ? state.currentLocation : null;

  // When dialog opens, select the current folder
  useEffect(() => {
    if (showDialog) {
      selectItem();
    }
  }, [showDialog, selectItem]);

  // Reflect the current selection/location in the editable path field.
  useEffect(() => {
    setPathInput(currentPathDisplay);
  }, [currentPathDisplay]);

  const handlePathInputSubmit = () => {
    const trimmed = pathInput.trim();
    if (!trimmed || trimmed === currentPathDisplay) {
      return;
    }
    if (!navigateToRawPath(trimmed)) {
      toast.error('No file share found for that path');
      setPathInput(currentPathDisplay);
    }
  };

  const resetNewFolder = () => {
    setShowNewFolder(false);
    setNewFolderName('');
  };

  const onClose = () => {
    reset();
    resetNewFolder();
    setShowDialog(false);
  };

  const handleCreateFolder = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      !currentFilesystem ||
      !newFolderName.trim() ||
      !nameValidation.isValid
    ) {
      return;
    }
    const base = currentFilesystem.path === '.' ? '' : currentFilesystem.path;
    try {
      await createFolderMutation.mutateAsync({
        fspName: currentFilesystem.fspName,
        folderPath: joinPaths(base, newFolderName.trim())
      });
      toast.success('New folder created!');
      resetNewFolder();
    } catch (err) {
      toast.error(
        `Error creating folder: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleSelect = () => {
    if (state.selectedItem) {
      lastSelectedParentPath = getParentPath(state.selectedItem.displayPath);
      onSelect(state.selectedItem.fullPath, state.selectedItem.displayPath);
      onClose();
    }
  };

  const handleCancel = () => {
    onClose();
  };

  // Determine button text based on selection
  const getSelectButtonText = () => {
    if (!state.selectedItem) {
      return 'Select';
    }
    return state.selectedItem.isDir ? 'Select Folder' : 'Select File';
  };

  return (
    <>
      <FgButton
        className={triggerClasses}
        icon={HiOutlineFolder}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          setShowDialog(true);
          e.currentTarget.blur();
        }}
        size="sm"
        type="button"
        variant="ghost"
      >
        {label}
      </FgButton>
      {showDialog ? (
        <FgDialog
          className="w-[920px] max-w-[92vw] max-h-max"
          onClose={onClose}
          open={showDialog}
        >
          <Typography
            className="mb-4 text-foreground font-bold text-2xl"
            variant="h4"
          >
            {mode === 'file'
              ? 'Select File'
              : mode === 'directory'
                ? 'Select Folder'
                : 'Select File or Folder'}
          </Typography>

          {/* Breadcrumbs */}
          <FileSelectorBreadcrumbs
            currentLocation={state.currentLocation}
            onNavigate={navigateToLocation}
            zonesData={zonesQuery.data}
          />

          {/* Toolbar: go home, new folder, show/hide dot files, filter */}
          <div className="mt-2 flex items-center gap-1">
            <FgTooltip
              as={IconButton}
              disabledCondition={!canGoHome}
              icon={HiHome}
              label="Go to home folder"
              onClick={() => {
                resetNewFolder();
                navigateHome();
              }}
              triggerClasses={toolbarBtnClasses}
            />
            <FgTooltip
              as={IconButton}
              disabledCondition={!currentFilesystem}
              icon={HiFolderAdd}
              label="New folder"
              onClick={() => {
                if (currentFilesystem) {
                  setShowNewFolder(prev => !prev);
                }
              }}
              triggerClasses={toolbarBtnClasses}
            />
            <FgTooltip
              as={IconButton}
              icon={hideDotFiles ? HiEyeOff : HiEye}
              label={hideDotFiles ? 'Show dot files' : 'Hide dot files'}
              onClick={toggleHideDotFiles}
              triggerClasses={toolbarBtnClasses}
            />
            <div className="relative ml-1 flex-1">
              <Input
                className="bg-background text-foreground [&::-webkit-search-cancel-button]:appearance-none"
                onChange={handleSearchChange}
                placeholder="Type to filter"
                type="search"
                value={searchQuery}
              >
                <Input.Icon>
                  <FgIcon className="h-full w-full" icon={HiOutlineFunnel} />
                </Input.Icon>
              </Input>
              {searchQuery ? (
                <button
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-primary hover:text-primary/80 transition-colors"
                  onClick={clearSearch}
                  type="button"
                >
                  <FgIcon className="font-bold" icon={HiXMark} />
                </button>
              ) : null}
            </div>
          </div>

          {/* Inline new-folder form */}
          {showNewFolder && currentFilesystem ? (
            <form
              className="mt-2 flex items-start gap-2"
              onSubmit={handleCreateFolder}
            >
              <div className="flex-1">
                <FgInput
                  autoFocus
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setNewFolderName(event.target.value)
                  }
                  placeholder="New folder name ..."
                  type="text"
                  value={newFolderName}
                />
                {nameValidation.errorMessage ? (
                  <Typography className="mt-1 text-xs text-error">
                    {nameValidation.errorMessage}
                  </Typography>
                ) : null}
              </div>
              <FgButton
                disabled={
                  !newFolderName.trim() ||
                  !nameValidation.isValid ||
                  createFolderMutation.isPending
                }
                loading={createFolderMutation.isPending}
                loadingText="Creating..."
                type="submit"
              >
                Create
              </FgButton>
              <FgButton onClick={resetNewFolder} type="button" variant="ghost">
                Cancel
              </FgButton>
            </form>
          ) : null}

          {/* Table with loading/error states. Height scales with the
              viewport so shorter screens shrink the (scrollable) file list. */}
          <div className="my-4 h-[50vh] max-h-96 min-h-[10rem]">
            {zonesQuery.isPending ? (
              <div className="flex items-center justify-center h-full">
                <Spinner
                  text="Loading zones..."
                  textClasses="text-foreground"
                />
              </div>
            ) : zonesQuery.isError ? (
              <div className="flex items-center justify-center h-full">
                <Typography className="text-error">
                  Error loading zones: {zonesQuery.error.message}
                </Typography>
              </div>
            ) : state.currentLocation.type === 'filesystem' &&
              fileQuery.isPending ? (
              <div className="flex items-center justify-center h-full">
                <Spinner
                  text="Loading files..."
                  textClasses="text-foreground"
                />
              </div>
            ) : state.currentLocation.type === 'filesystem' &&
              fileQuery.isError ? (
              <div className="flex items-center justify-center h-full">
                <Typography className="text-error">
                  {fileQuery.error.message}
                </Typography>
              </div>
            ) : (
              <FileSelectorTable
                currentLocation={state.currentLocation}
                data={displayItems}
                onItemClick={selectItem}
                onItemDoubleClick={handleItemDoubleClick}
                selectedItem={state.selectedItem}
                zonesData={zonesQuery.data}
              />
            )}
          </div>

          {/* Group filter status */}
          {state.currentLocation.type === 'zones' && userHasGroups ? (
            <div className="text-center pb-4">
              <Typography className="text-xs text-foreground/60">
                {isFilteredByGroups
                  ? 'Viewing zones for your groups only'
                  : 'Viewing all zones'}
              </Typography>
            </div>
          ) : null}

          {/* Editable path: paste a path here to navigate the browser there */}
          <div className="mb-4">
            <Typography className="mb-1 text-sm text-foreground/60">
              Path
            </Typography>
            <FgInput
              className="font-mono"
              onBlur={handlePathInputSubmit}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setPathInput(event.target.value)
              }
              onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handlePathInputSubmit();
                }
              }}
              placeholder="Type or paste a path to navigate ..."
              type="text"
              value={pathInput}
            />
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 mt-4">
            <FgButton onClick={handleCancel} variant="ghost">
              Cancel
            </FgButton>
            <FgButton disabled={!state.selectedItem} onClick={handleSelect}>
              {getSelectButtonText()}
            </FgButton>
          </div>
        </FgDialog>
      ) : null}
    </>
  );
}
