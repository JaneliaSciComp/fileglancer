import React from 'react';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import {
  Button,
  Dialog,
  IconButton,
  Typography
} from '@material-tailwind/react';
import { HiX } from 'react-icons/hi';

import {
  FolderFavorite,
  usePreferencesContext
} from '@/contexts/PreferencesContext';
import {
  getPreferredPathForDisplay,
  makeBrowseLink,
  removeLastSegmentFromPath
} from '@/utils';

type MissingFolderFavoriteDialogProps = {
  readonly folderFavorite: FolderFavorite;
  readonly showMissingFolderFavoriteDialog: boolean;
  readonly setShowMissingFolderFavoriteDialog: React.Dispatch<
    React.SetStateAction<boolean>
  >;
};

export default function MissingFolderFavoriteDialog({
  folderFavorite,
  showMissingFolderFavoriteDialog,
  setShowMissingFolderFavoriteDialog
}: MissingFolderFavoriteDialogProps): JSX.Element {
  const { handleFavoriteChange, pathPreference } = usePreferencesContext();
  const navigate = useNavigate();

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
            className="absolute right-2 top-2 text-secondary hover:text-background"
            color="secondary"
            isCircular
            onClick={() => {
              setShowMissingFolderFavoriteDialog(false);
            }}
            size="sm"
            variant="outline"
          >
            <HiX className="icon-default" />
          </IconButton>
          <Typography className="my-8 text-large">
            Folder <span className="font-semibold">{displayPath}</span> does not
            exist. Do you want to delete it from your favorites?
          </Typography>
          <div className="flex gap-2">
            <Button
              className="!rounded-md flex items-center gap-2"
              color="error"
              onClick={async () => {
                const result = await handleFavoriteChange(
                  folderFavorite,
                  'folder'
                );
                if (result.success) {
                  navigate(
                    makeBrowseLink(
                      folderFavorite.fsp.name,
                      removeLastSegmentFromPath(folderFavorite.folderPath)
                    )
                  );
                  toast.success(`Deleted favorite folder ${displayPath}`);
                } else {
                  toast.error(`Error deleting favorite: ${result.error}`);
                }
              }}
              variant="outline"
            >
              Delete
            </Button>
            <Button
              className="!rounded-md flex items-center gap-2"
              onClick={() => {
                setShowMissingFolderFavoriteDialog(false);
              }}
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog>
  );
}
