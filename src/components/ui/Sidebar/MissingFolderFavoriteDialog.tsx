import React from 'react';
import toast from 'react-hot-toast';
import {
  Button,
  Dialog,
  IconButton,
  Typography
} from '@material-tailwind/react';
import { XMarkIcon } from '@heroicons/react/24/outline';

import {
  FolderFavorite,
  usePreferencesContext
} from '@/contexts/PreferencesContext';
import { getPreferredPathForDisplay } from '@/utils';

type MissingFolderFavoriteDialogProps = {
  folderFavorite: FolderFavorite;
  showMissingFolderFavoriteDialog: boolean;
  setShowMissingFolderFavoriteDialog: React.Dispatch<
    React.SetStateAction<boolean>
  >;
};

export default function MissingFolderFavoriteDialog({
  folderFavorite,
  showMissingFolderFavoriteDialog,
  setShowMissingFolderFavoriteDialog
}: MissingFolderFavoriteDialogProps): JSX.Element {
  const { handleFavoriteChange, pathPreference } = usePreferencesContext();

  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    folderFavorite.fsp,
    folderFavorite.folderPath
  );

  return (
    <Dialog open={showMissingFolderFavoriteDialog}>
      <Dialog.Overlay>
        <Dialog.Content>
          <IconButton
            size="sm"
            variant="outline"
            color="secondary"
            className="absolute right-2 top-2 text-secondary hover:text-background"
            isCircular
            onClick={() => {
              setShowMissingFolderFavoriteDialog(false);
            }}
          >
            <XMarkIcon className="icon-default" />
          </IconButton>
          <Typography className="my-8 text-large">
            Folder <span className="font-semibold">{displayPath}</span> does not
            exist. Do you want to delete it from your favorites?
          </Typography>
          <div className="flex gap-2">
            <Button
              variant="outline"
              color="error"
              className="!rounded-md flex items-center gap-2"
              onClick={async () => {
                const result = await handleFavoriteChange(
                  folderFavorite,
                  'folder'
                );
                if (!result.success) {
                  toast.error(
                    `Failed to delete favorite folder: ${result.error}`
                  );
                } else {
                  toast.success(`Deleted favorite folder ${displayPath}`);
                  setShowMissingFolderFavoriteDialog(false);
                }
              }}
            >
              Delete
            </Button>
            <Button
              variant="outline"
              className="!rounded-md flex items-center gap-2"
              onClick={() => {
                setShowMissingFolderFavoriteDialog(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog>
  );
}
