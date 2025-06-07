import React from 'react';
import {
  Button,
  Dialog,
  IconButton,
  Typography
} from '@material-tailwind/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { useZoneBrowserContext } from '@/contexts/ZoneBrowserContext';

type SharingDialogProps = {
  isImageShared: boolean;
  setIsImageShared: React.Dispatch<React.SetStateAction<boolean>>;
  filePathWithoutFsp: string;
  showSharingDialog: boolean;
  setShowSharingDialog: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function SharingDialog({
  isImageShared,
  setIsImageShared,
  filePathWithoutFsp,
  showSharingDialog,
  setShowSharingDialog
}: SharingDialogProps): JSX.Element {
  const { createProxiedPath, deleteProxiedPath } = useProxiedPathContext();
  const { currentFileSharePath } = useZoneBrowserContext();
  const displayPath = `${currentFileSharePath?.mount_path}/${filePathWithoutFsp}`;

  return (
    <Dialog open={showSharingDialog}>
      <Dialog.Overlay>
        <Dialog.Content className="bg-surface-light dark:bg-surface">
          <IconButton
            size="sm"
            variant="outline"
            color="secondary"
            className="absolute right-2 top-2 text-secondary hover:text-background rounded-full"
            onClick={() => {
              setShowSharingDialog(false);
            }}
          >
            <XMarkIcon className="icon-default" />
          </IconButton>
          {/* TODO: Move Janelia-specific text elsewhere */}
          {isImageShared ? (
            <div className="my-8 text-large text-foreground">
              <Typography>
                Are you sure you want to unshare{' '}
                <span className="font-semibold break-all">{displayPath}</span>?
              </Typography>
              <Typography className="mt-4">
                If you previously shared a link to these data with
                collaborators, the link will no longer work. You can always
                share these data again later.
              </Typography>
            </div>
          ) : (
            <div className="my-8 text-large text-foreground">
              <Typography>
                Are you sure you want to share{' '}
                <span className="font-semibold break-all">{displayPath}</span>?
              </Typography>
              <Typography className="mt-4">
                This will allow anyone at Janelia to view this data.
              </Typography>
            </div>
          )}

          <div className="flex gap-2">
            {!isImageShared ? (
              <Button
                variant="outline"
                color="error"
                className="!rounded-md flex items-center gap-2"
                onClick={async () => {
                  try {
                    const newProxiedPath = await createProxiedPath(
                      currentFileSharePath?.mount_path || '',
                      filePathWithoutFsp
                    );
                    if (newProxiedPath) {
                      toast.success(`Successfully shared ${displayPath}`);
                    } else {
                      toast.error(`Error sharing ${displayPath}`);
                    }
                    setIsImageShared(true);
                    setShowSharingDialog(false);
                  } catch (error) {
                    toast.error(
                      `Error sharing ${displayPath}: ${
                        error instanceof Error ? error.message : 'Unknown error'
                      }`
                    );
                  }
                }}
              >
                Share image
              </Button>
            ) : null}
            {isImageShared ? (
              <Button
                variant="outline"
                color="error"
                className="!rounded-md flex items-center gap-2"
                onClick={async () => {
                  try {
                    await deleteProxiedPath();
                    setIsImageShared(false);
                    toast.success(`Successfully unshared ${displayPath}`);
                    setShowSharingDialog(false);
                  } catch (error) {
                    toast.error(
                      `Error unsharing ${displayPath}: ${
                        error instanceof Error ? error.message : 'Unknown error'
                      }`
                    );
                  }
                }}
              >
                Unshare image
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="!rounded-md flex items-center gap-2"
              onClick={() => {
                setShowSharingDialog(false);
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
