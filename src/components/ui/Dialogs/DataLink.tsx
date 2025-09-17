import React from 'react';
import { Button, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import {
  ProxiedPath,
  useProxiedPathContext
} from '@/contexts/ProxiedPathContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { getPreferredPathForDisplay, makeMapKey } from '@/utils';
import type { FileSharePath } from '@/shared.types';
import FgDialog from './FgDialog';
import TextWithFilePath from './TextWithFilePath';

type DataLinkDialogProps = {
  readonly isImageShared: boolean;
  readonly setIsImageShared?: React.Dispatch<React.SetStateAction<boolean>>;
  readonly showDataLinkDialog: boolean;
  readonly setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
  readonly proxiedPath: ProxiedPath | null;
};

export default function DataLinkDialog({
  isImageShared,
  setIsImageShared,
  showDataLinkDialog,
  setShowDataLinkDialog,
  proxiedPath
}: DataLinkDialogProps): JSX.Element {
  const { createProxiedPath, deleteProxiedPath, refreshProxiedPaths } =
    useProxiedPathContext();
  const { fileBrowserState } = useFileBrowserContext();
  const { pathPreference } = usePreferencesContext();
  const { zonesAndFileSharePathsMap } = useZoneAndFspMapContext();

  const fspKey = proxiedPath
    ? makeMapKey('fsp', proxiedPath.fsp_name)
    : fileBrowserState.currentFileSharePath
      ? makeMapKey('fsp', fileBrowserState.currentFileSharePath.name)
      : '';

  if (fspKey === '') {
    return <>{toast.error('Valid file share path or proxied path required')}</>;
  }

  const pathFsp = zonesAndFileSharePathsMap[fspKey] as FileSharePath;
  const targetPath = proxiedPath
    ? proxiedPath.path
    : fileBrowserState.currentFileOrFolder
      ? fileBrowserState.currentFileOrFolder.path
      : '';

  if (!targetPath) {
    return <>{toast.error('Valid current folder or proxied path required')}</>;
  }

  const displayPath = getPreferredPathForDisplay(
    pathPreference,
    pathFsp,
    targetPath
  );

  return (
    <FgDialog
      onClose={() => setShowDataLinkDialog(false)}
      open={showDataLinkDialog}
    >
      {/* TODO: Move Janelia-specific text elsewhere */}
      {isImageShared ? (
        <div className="my-8 text-foreground">
          <TextWithFilePath
            path={displayPath}
            text="Are you sure you want to delete the data link for this path?"
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
            path={displayPath}
            text="Are you sure you want to create a data link for this path?"
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
            className="!rounded-md flex items-center gap-2"
            color="error"
            onClick={async () => {
              const createProxiedPathResult = await createProxiedPath();
              if (createProxiedPathResult.success) {
                toast.success(
                  `Successfully created data link for ${displayPath}`
                );
                const refreshResult = await refreshProxiedPaths();
                if (!refreshResult.success) {
                  toast.error(
                    `Error refreshing proxied paths: ${refreshResult.error}`
                  );
                  return;
                }
              } else {
                toast.error(
                  `Error creating data link: ${createProxiedPathResult.error}`
                );
              }
              setShowDataLinkDialog(false);
              if (setIsImageShared) {
                // setIsImageShared does not exist in props for proxied path row,
                // where the image is always shared
                setIsImageShared(true);
              }
            }}
            variant="outline"
          >
            Create Data Link
          </Button>
        ) : null}
        {isImageShared ? (
          <Button
            className="!rounded-md flex items-center gap-2"
            color="error"
            onClick={async () => {
              if (!proxiedPath) {
                toast.error('Proxied path not found');
                return;
              }

              const deleteResult = await deleteProxiedPath(proxiedPath);
              if (!deleteResult.success) {
                toast.error(`Error deleting data link: ${deleteResult.error}`);
                return;
              } else {
                toast.success(
                  `Successfully deleted data link for ${displayPath}`
                );

                const refreshResult = await refreshProxiedPaths();
                if (!refreshResult.success) {
                  toast.error(
                    `Error refreshing proxied paths: ${refreshResult.error}`
                  );
                  return;
                }
              }

              setShowDataLinkDialog(false);
              if (setIsImageShared) {
                setIsImageShared(false);
              }
            }}
            variant="outline"
          >
            Delete Data Link
          </Button>
        ) : null}
        <Button
          className="!rounded-md flex items-center gap-2"
          onClick={() => {
            setShowDataLinkDialog(false);
          }}
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </FgDialog>
  );
}
