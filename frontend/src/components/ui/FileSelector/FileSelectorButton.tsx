import { useState, useEffect } from 'react';
import type { MouseEvent } from 'react';
import { Button, Input, Typography } from '@material-tailwind/react';
import { HiOutlineFolder, HiOutlineFunnel, HiXMark } from 'react-icons/hi2';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import FileSelectorBreadcrumbs from './FileSelectorBreadcrumbs';
import FileSelectorTable from './FileSelectorTable';
import { Spinner } from '@/components/ui/widgets/Loaders';
import useFileSelector from '@/hooks/useFileSelector';
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
};

export default function FileSelectorButton({
  onSelect,
  triggerClasses = '',
  label = 'Browse...',
  initialLocation,
  mode = 'any',
  useServerPath,
  initialPath
}: FileSelectorButtonProps) {
  const [showDialog, setShowDialog] = useState(false);

  // Use initialPath if provided, otherwise fall back to last confirmed selection's parent
  const effectiveInitialPath =
    initialPath || lastSelectedParentPath || undefined;

  const {
    state,
    displayItems,
    fileQuery,
    zonesQuery,
    navigateToLocation,
    selectItem,
    handleItemDoubleClick,
    reset,
    searchQuery,
    handleSearchChange,
    clearSearch,
    isFilteredByGroups,
    userHasGroups
  } = useFileSelector({
    initialLocation,
    initialPath: showDialog ? effectiveInitialPath : undefined,
    mode,
    pathPreferenceOverride: useServerPath ? ['linux_path'] : undefined
  });

  // When dialog opens, select the current folder
  useEffect(() => {
    if (showDialog) {
      selectItem();
    }
  }, [showDialog, selectItem]);

  const onClose = () => {
    reset();
    setShowDialog(false);
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
      <Button
        className={triggerClasses}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          setShowDialog(true);
          e.currentTarget.blur();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        <HiOutlineFolder className="icon-small mr-1" />
        {label}
      </Button>
      {showDialog ? (
        <FgDialog
          className="w-[800px] max-w-[90vw] max-h-max"
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

          {/* Search input */}
          <div className="my-2 relative">
            <Input
              className="bg-background text-foreground [&::-webkit-search-cancel-button]:appearance-none"
              onChange={handleSearchChange}
              placeholder="Type to filter"
              type="search"
              value={searchQuery}
            >
              <Input.Icon>
                <HiOutlineFunnel className="h-full w-full" />
              </Input.Icon>
            </Input>
            {searchQuery ? (
              <button
                aria-label="Clear search"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-primary hover:text-primary/80 transition-colors"
                onClick={clearSearch}
                type="button"
              >
                <HiXMark className="h-5 w-5 font-bold" />
              </button>
            ) : null}
          </div>

          {/* Table with loading/error states */}
          <div className="my-4 h-96">
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

          {/* Selected path display */}

          <div className="mb-4 p-2 h-14 bg-surface rounded">
            <Typography className="text-sm text-foreground/60">
              Selected:
            </Typography>
            {state.selectedItem ? (
              <Typography className="text-sm text-foreground font-mono truncate">
                {state.selectedItem.displayPath}
              </Typography>
            ) : (
              <div className="h-5" />
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-2 mt-4">
            <Button onClick={handleCancel} variant="outline">
              Cancel
            </Button>
            <Button disabled={!state.selectedItem} onClick={handleSelect}>
              {getSelectButtonText()}
            </Button>
          </div>
        </FgDialog>
      ) : null}
    </>
  );
}
