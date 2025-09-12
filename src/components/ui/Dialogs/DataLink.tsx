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
import AutomaticLinksToggle from '@/components/ui/PreferencesPage/AutomaticLinksToggle';

type DataLinkDialogProps = {
  action: 'create' | 'delete';
  showDataLinkDialog: boolean;
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
  proxiedPath: ProxiedPath | null;
  pendingNavigationUrl?: string | null;
  setPendingNavigationUrl?: React.Dispatch<React.SetStateAction<string | null>>;
};

function CreateLinkBtn({
  displayPath,
  pendingNavigationUrl,
  setPendingNavigationUrl,
  setShowDataLinkDialog
}: {
  displayPath: string;
  pendingNavigationUrl?: string | null;
  setPendingNavigationUrl?: React.Dispatch<React.SetStateAction<string | null>>;
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
}): JSX.Element {
  const { createProxiedPath, fetchProxiedPath, refreshProxiedPaths } =
    useProxiedPathContext();

  async function refreshLinks() {
    const refreshResult = await refreshProxiedPaths();
    if (!refreshResult.success) {
      toast.error(`Error refreshing proxied paths: ${refreshResult.error}`);
      return;
    }
  }

  function navigateToPendingUrl() {
    if (pendingNavigationUrl && setPendingNavigationUrl) {
      window.open(pendingNavigationUrl, '_blank', 'noopener,noreferrer');
      setPendingNavigationUrl(null);
    }
  }

  return (
    <Button
      variant="outline"
      color="error"
      className="!rounded-md flex items-center gap-2"
      onClick={async () => {
        // Check if proxied path already exists
        const fetchResult = await fetchProxiedPath();
        if (!fetchResult.success) {
          toast.error(
            `Error checking for existing data link: ${fetchResult.error}`
          );
          return;
        }

        if (fetchResult.data) {
          // Proxied path already exists
          toast.success(`Data link exists for ${displayPath}`);
          await refreshLinks();
          navigateToPendingUrl();
        } else {
          // No existing proxied path, create one
          const createProxiedPathResult = await createProxiedPath();
          if (createProxiedPathResult.success) {
            toast.success(`Successfully created data link for ${displayPath}`);
            await refreshLinks();
            navigateToPendingUrl();
          } else {
            toast.error(
              `Error creating data link: ${createProxiedPathResult.error}`
            );
          }
        }
        setShowDataLinkDialog(false);
      }}
    >
      Create Data Link
    </Button>
  );
}

function DeleteLinkBtn({
  proxiedPath,
  displayPath,
  setShowDataLinkDialog
}: {
  proxiedPath: ProxiedPath | null;
  displayPath: string;
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
}): JSX.Element {
  const { deleteProxiedPath, refreshProxiedPaths } = useProxiedPathContext();

  return (
    <Button
      variant="outline"
      color="error"
      className="!rounded-md flex items-center gap-2 hover:text-background focus:text-background"
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
          toast.success(`Successfully deleted data link for ${displayPath}`);

          const refreshResult = await refreshProxiedPaths();
          if (!refreshResult.success) {
            toast.error(
              `Error refreshing proxied paths: ${refreshResult.error}`
            );
            return;
          }
        }

        setShowDataLinkDialog(false);
      }}
    >
      Delete Data Link
    </Button>
  );
}

function CancelBtn({
  setPendingNavigationUrl,
  setShowDataLinkDialog
}: {
  setPendingNavigationUrl?: React.Dispatch<React.SetStateAction<string | null>>;
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
}): JSX.Element {
  return (
    <Button
      variant="outline"
      className="!rounded-md flex items-center gap-2"
      onClick={() => {
        if (setPendingNavigationUrl) {
          setPendingNavigationUrl(null);
        }
        setShowDataLinkDialog(false);
      }}
    >
      Cancel
    </Button>
  );
}

function BtnContainer({
  children
}: {
  children: React.ReactNode;
}): JSX.Element {
  return <div className="flex gap-4">{children}</div>;
}

export default function DataLinkDialog({
  action,
  showDataLinkDialog,
  setShowDataLinkDialog,
  proxiedPath,
  pendingNavigationUrl,
  setPendingNavigationUrl
}: DataLinkDialogProps): JSX.Element {
  const { fileBrowserState } = useFileBrowserContext();
  const { pathPreference, automaticDataLinks } = usePreferencesContext();
  const { zonesAndFileSharePathsMap } = useZoneAndFspMapContext();

  const [localAutomaticDataLinks] = React.useState(automaticDataLinks);

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

  if (action === 'create' && localAutomaticDataLinks) {
    return <></>;
  }

  return (
    <FgDialog
      open={showDataLinkDialog}
      onClose={() => {
        if (setPendingNavigationUrl) {
          setPendingNavigationUrl(null);
        }
        setShowDataLinkDialog(false);
      }}
    >
      <div className="flex flex-col gap-4 my-4">
        {action === 'create' && !localAutomaticDataLinks ? (
          <>
            <TextWithFilePath
              text="Are you sure you want to create a data link for this path?"
              path={displayPath}
            />
            <Typography className="text-foreground">
              If you share the data link with internal collaborators, they will
              be able to view this data.
            </Typography>
            <div className="flex flex-col gap-2">
              <Typography className="font-semibold text-foreground">
                Don't ask me this again:
              </Typography>
              <AutomaticLinksToggle />
            </div>
            <BtnContainer>
              <CreateLinkBtn
                displayPath={displayPath}
                pendingNavigationUrl={pendingNavigationUrl}
                setPendingNavigationUrl={setPendingNavigationUrl}
                setShowDataLinkDialog={setShowDataLinkDialog}
              />
              <CancelBtn
                setPendingNavigationUrl={setPendingNavigationUrl}
                setShowDataLinkDialog={setShowDataLinkDialog}
              />
            </BtnContainer>
          </>
        ) : action === 'delete' && localAutomaticDataLinks ? (
          <>
            <TextWithFilePath
              text="Are you sure you want to delete the data link for this path?"
              path={displayPath}
            />
            <Typography className="text-foreground">
              <span className="font-semibold">Warning:</span> The existing data
              link to this data will be deleted. Collaborators who previously
              received the link will no longer be able to access it.
            </Typography>
            <BtnContainer>
              <DeleteLinkBtn
                proxiedPath={proxiedPath}
                displayPath={displayPath}
                setShowDataLinkDialog={setShowDataLinkDialog}
              />
              <CancelBtn
                setPendingNavigationUrl={setPendingNavigationUrl}
                setShowDataLinkDialog={setShowDataLinkDialog}
              />
            </BtnContainer>
            <Typography className="text-foreground">
              <span className="font-semibold">Note:</span> Automatic data links
              are currently enabled. To disable this feature, click the checkbox
              below before deleting this data link.
            </Typography>
            <AutomaticLinksToggle />
          </>
        ) : action === 'delete' && !localAutomaticDataLinks ? (
          <>
            <TextWithFilePath
              text="Are you sure you want to delete the data link for this path?"
              path={displayPath}
            />
            <Typography className="text-foreground">
              <span className="font-semibold">Warning:</span> The existing data
              link to this data will be deleted. Collaborators who previously
              received the link will no longer be able to access it. You can
              create a new data link at any time by navigating to the file path
              and clicking on one of the data viewers.
            </Typography>
            <BtnContainer>
              <DeleteLinkBtn
                proxiedPath={proxiedPath}
                displayPath={displayPath}
                setShowDataLinkDialog={setShowDataLinkDialog}
              />
              <CancelBtn
                setPendingNavigationUrl={setPendingNavigationUrl}
                setShowDataLinkDialog={setShowDataLinkDialog}
              />
            </BtnContainer>
          </>
        ) : null}
      </div>
    </FgDialog>
  );
}
