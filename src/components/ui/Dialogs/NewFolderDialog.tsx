import React from 'react';
import {
  Alert,
  Button,
  Dialog,
  IconButton,
  Typography
} from '@material-tailwind/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import useNewFolderDialog from '@/hooks/useNewFolderDialog';

type ItemNamingDialogProps = {
  showNewFolderDialog: boolean;
  setShowNewFolderDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function NewFolderDialog({
  showNewFolderDialog,
  setShowNewFolderDialog
}: ItemNamingDialogProps): JSX.Element {
  const {
    handleNewFolderSubmit,
    newName,
    setNewName,
    setShowAlert,
    alertContent
  } = useNewFolderDialog();

  return (
    <Dialog open={showNewFolderDialog}>
      <Dialog.Overlay>
        <Dialog.Content className="bg-surface-light dark:bg-surface">
          <IconButton
            size="sm"
            variant="outline"
            color="secondary"
            className="absolute right-2 top-2 text-secondary hover:text-background"
            isCircular
            onClick={() => {
              setShowNewFolderDialog(false);
              setNewName('');
              setShowAlert(false);
            }}
          >
            <XMarkIcon className="icon-default" />
          </IconButton>
          <form
            onSubmit={async event => {
              event.preventDefault();
              setShowAlert(false);
              const success = await handleNewFolderSubmit();
              if (success) {
                setShowNewFolderDialog(false);
                setNewName('');
              }
            }}
          >
            <div className="mt-8 flex flex-col gap-2">
              <Typography
                as="label"
                htmlFor="new_name"
                className="text-foreground font-semibold"
              >
                New Folder Name
              </Typography>
              <input
                type="text"
                id="new_name"
                autoFocus
                value={newName}
                placeholder="Enter name"
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                  setNewName(event.target.value);
                }}
                className="mb-4 p-2 text-foreground text-lg border border-primary-light rounded-sm focus:outline-none focus:border-primary bg-background"
              />
            </div>
            <Button className="!rounded-md" type="submit">
              Submit
            </Button>
            {alertContent ? (
              <Alert className="flex items-center gap-6 mt-6 border-none bg-error-light/90">
                <Alert.Content>{alertContent}</Alert.Content>
                <XMarkIcon
                  className="icon-default cursor-pointer"
                  onClick={() => setShowAlert(false)}
                />
              </Alert>
            ) : null}
          </form>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog>
  );
}
