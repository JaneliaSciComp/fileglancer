import React from 'react';
import {
  Alert,
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
  const [showAlert, setShowAlert] = React.useState<boolean>(false);
  const [alertContent, setAlertContent] = React.useState<string>('');
  const { handleFavoriteChange } = usePreferencesContext();

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
              setShowAlert(false);
            }}
          >
            <XMarkIcon className="icon-default" />
          </IconButton>
          <Typography className="my-8 text-large">
            Folder{' '}
            <span className="font-semibold">{folderFavorite.folderPath}</span>{' '}
            does not exist. Do you want to delete it from your favorites?
          </Typography>
          <div className="flex gap-2">
            <Button
              variant="outline"
              color="error"
              className="!rounded-md flex items-center gap-2"
              onClick={() => {
                try {
                  handleFavoriteChange(folderFavorite, 'folder');
                } catch (error) {
                  setAlertContent(
                    `Error deleting favorite folder ${folderFavorite.folderPath}: ${
                      error instanceof Error ? error.message : 'Unknown error'
                    }`
                  );
                  setShowAlert(true);
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
          {showAlert === true ? (
            <Alert
              className={`flex items-center gap-6 mt-6 border-none ${alertContent.startsWith('Error') ? 'bg-error-light/90' : 'bg-secondary-light/70'}`}
            >
              <Alert.Content>{alertContent}</Alert.Content>
              <XMarkIcon
                className="icon-default cursor-pointer"
                onClick={() => {
                  setShowAlert(false);
                  setShowMissingFolderFavoriteDialog(false);
                }}
              />
            </Alert>
          ) : null}
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog>
  );
}
