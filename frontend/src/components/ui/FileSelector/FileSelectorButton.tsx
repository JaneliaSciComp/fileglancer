import { useState, useEffect } from 'react';
import type { MouseEvent } from 'react';
import { Typography } from '@material-tailwind/react';
import { HiOutlineFolder } from 'react-icons/hi2';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FileSelectorBrowser from './FileSelectorBrowser';
import useFileSelector from '@/hooks/useFileSelector';
import type {
  FileSelectorInitialLocation,
  FileSelectorMode
} from '@/hooks/useFileSelector';

// Remember the folder of the last confirmed selection across all instances:
// the selection itself when it was a folder, its parent when it was a file.
let lastSelectedFolderPath: string | null = null;

function getParentPath(fullPath: string): string {
  // Strip trailing slash, then take everything up to the last separator
  const trimmed = fullPath.replace(/[\\/]+$/, '');
  const lastSep = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return lastSep > 0 ? trimmed.slice(0, lastSep) : trimmed;
}

type FileSelectorButtonProps = {
  readonly onSelect: (
    path: string,
    displayPath: string,
    isDir: boolean
  ) => void;
  readonly triggerClasses?: string;
  readonly label?: string;
  readonly initialLocation?: FileSelectorInitialLocation;
  readonly mode?: FileSelectorMode;
  readonly useServerPath?: boolean;
  readonly initialPath?: string;
  readonly defaultToHome?: boolean;
};

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

  // Use initialPath if provided, otherwise fall back to the last confirmed
  // selection's folder
  const effectiveInitialPath =
    initialPath || lastSelectedFolderPath || undefined;
  // The field's own value in file mode names a file, so the browser should
  // open its parent folder. The remembered fallback is already a folder and
  // must be opened as-is.
  const initialPathIsFile = Boolean(initialPath) && mode !== 'directory';

  const selector = useFileSelector({
    initialLocation,
    initialPath: showDialog ? effectiveInitialPath : undefined,
    initialPathIsFile,
    pathPreferenceOverride: useServerPath ? ['linux_path'] : undefined,
    defaultToHome
  });
  const { state, selectItem, reset } = selector;

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
      lastSelectedFolderPath = state.selectedItem.isDir
        ? state.selectedItem.displayPath
        : getParentPath(state.selectedItem.displayPath);
      onSelect(
        state.selectedItem.fullPath,
        state.selectedItem.displayPath,
        state.selectedItem.isDir
      );
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

          <FileSelectorBrowser onItemClick={selectItem} selector={selector} />

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
