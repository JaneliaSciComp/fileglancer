import React from 'react';
import { Button, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import {
  ProxiedPath,
  useProxiedPathContext
} from '@/contexts/ProxiedPathContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { getPreferredPathForDisplay } from '@/utils';
import FgDialog from './FgDialog';
import TextWithFilePath from './TextWithFilePath';

type DataLinkDialogProps = {
  isImageShared: boolean;
  setIsImageShared?: React.Dispatch<React.SetStateAction<boolean>>;
  filePathWithoutFsp: string;
  showDataLinkDialog: boolean;
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
  proxiedPath: ProxiedPath | null;
};

export default function DataLinkDialog({
  isImageShared,
  setIsImageShared,
  filePathWithoutFsp,
  showDataLinkDialog,
  setShowDataLinkDialog,
  proxiedPath
}: DataLinkDialogProps): JSX.Element {
  const { createProxiedPath, deleteProxiedPath } = useProxiedPathContext();
  const { currentFileSharePath } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();

  if (!currentFileSharePath) {
    return <>{toast.error('No file share path selected')}</>; // No file share path available
  }
  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    currentFileSharePath,
    filePathWithoutFsp
  );

  return (
    <FgDialog
      open={showDataLinkDialog}
      onClose={() => setShowDataLinkDialog(false)}
    >
      {/* TODO: Move Janelia-specific text elsewhere */}
      {isImageShared ? (
        <div className="my-8 text-foreground">
          <TextWithFilePath
            text="Are you sure you want to delete the data link for this path?"
            path={displayPath}
          />
          <Typography className="mt-4">
            Warning: The existing data link to this data will be deleted.
            Collaborators who previously received the link will no longer be
            able to access it. You can create a new data link at any time if
            needed.
          </Typography>
        </div>
      ) : (
        <div className="my-8 text-foreground">
          <TextWithFilePath
            text="Are you sure you want to create a data link for this path?"
            path={displayPath}
          />
          <Typography className="mt-4">
            If you share the data link with internal collaborators, they will be
            able to view this data.
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
              const result = await createProxiedPath(
                currentFileSharePath.name,
                filePathWithoutFsp
              );
              if (result.success) {
                toast.success(
                  `Successfully created data link for ${displayPath}`
                );
              } else {
                toast.error(`Error creating data link: ${result.error}`);
              }
              setShowDataLinkDialog(false);
              if (setIsImageShared) {
                // setIsImageShared does not exist in props for proxied path row,
                // where the image is always shared
                setIsImageShared(true);
              }
            }}
          >
            Create Data Link
          </Button>
        ) : null}
        {isImageShared ? (
          <Button
            variant="outline"
            color="error"
            className="!rounded-md flex items-center gap-2"
            onClick={async () => {
              try {
                if (proxiedPath) {
                  await deleteProxiedPath(proxiedPath);
                } else {
                  toast.error('Proxied path not found');
                }
                toast.success(
                  `Successfully deleted data link for ${displayPath}`
                );
                setShowDataLinkDialog(false);
                if (setIsImageShared) {
                  setIsImageShared(false);
                }
              } catch (error) {
                toast.error(
                  `Error deleting data link for ${displayPath}: ${
                    error instanceof Error ? error.message : 'Unknown error'
                  }`
                );
              }
            }}
          >
            Delete Data Link
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="!rounded-md flex items-center gap-2"
          onClick={() => {
            setShowDataLinkDialog(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </FgDialog>
  );
}
