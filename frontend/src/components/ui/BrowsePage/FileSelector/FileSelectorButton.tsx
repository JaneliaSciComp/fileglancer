import { useState, useEffect } from 'react';
import type { MouseEvent } from 'react';
import { Button, Typography } from '@material-tailwind/react';
import { HiOutlineFolder } from 'react-icons/hi2';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import FileSelectorBreadcrumbs from './FileSelectorBreadcrumbs';
import FileSelectorTable from './FileSelectorTable';
import { Spinner } from '@/components/ui/widgets/Loaders';
import useFileSelector from '@/hooks/useFileSelector';
import type {
  FileSelectorInitialLocation,
  FileSelectorMode
} from '@/hooks/useFileSelector';

type FileSelectorButtonProps = {
  readonly onSelect: (path: string) => void;
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

  const {
    state,
    displayItems,
    fileQuery,
    zonesQuery,
    navigateToLocation,
    selectItem,
    handleItemDoubleClick,
    reset
  } = useFileSelector({
    initialLocation,
    initialPath: showDialog ? initialPath : undefined,
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
      onSelect(state.selectedItem.fullPath);
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

          {/* Selected path display */}

          <div className="mb-4 p-2 h-14 bg-surface rounded">
            <Typography className="text-sm text-foreground/60">
              Selected:
            </Typography>
            {state.selectedItem ? (
              <Typography className="text-sm text-foreground font-mono truncate">
                {state.selectedItem.fullPath}
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
