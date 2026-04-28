import type { Dispatch, SetStateAction } from 'react';
import { useNavigate } from 'react-router';
import toast from 'react-hot-toast';
import { Dialog, IconButton, Typography } from '@material-tailwind/react';
import { HiX } from 'react-icons/hi';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import {
  FolderFavorite,
  usePreferencesContext
} from '@/contexts/PreferencesContext';
import {
  getPreferredPathForDisplay,
  makeBrowseLink,
  removeLastSegmentFromPath
} from '@/utils';
import FgButton from '@/components/designSystem/atoms/FgButton';

type MissingFolderFavoriteDialogProps = {
  readonly folderFavorite: FolderFavorite;
  readonly showMissingFolderFavoriteDialog: boolean;
  readonly setShowMissingFolderFavoriteDialog: Dispatch<
    SetStateAction<boolean>
  >;
};

export default function MissingFolderFavoriteDialog({
  folderFavorite,
  showMissingFolderFavoriteDialog,
  setShowMissingFolderFavoriteDialog
}: MissingFolderFavoriteDialogProps) {
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
            <FgIcon icon={HiX} />
          </IconButton>
          <Typography className="my-8 text-large">
            Folder <span className="font-semibold">{displayPath}</span> does not
            exist. Do you want to delete it from your favorites?
          </Typography>
          <div className="flex gap-2">
            <FgButton
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
            >
              Delete
            </FgButton>
            <FgButton
              onClick={() => {
                setShowMissingFolderFavoriteDialog(false);
              }}
              variant="ghost"
            >
              Cancel
            </FgButton>
          </div>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog>
  );
}
