import React from 'react';
import { Button, Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { getPreferredPathForDisplay, makeMapKey } from '@/utils';
import type { FileSharePath } from '@/shared.types';
import type { OpenWithToolUrls, PendingToolUrl } from '@/hooks/useZarrMetadata';
import FgDialog from './FgDialog';
import TextWithFilePath from './TextWithFilePath';
import AutomaticLinksToggle from '@/components/ui/PreferencesPage/AutomaticLinksToggle';

type DataLinkDialogProps = {
  action: 'create' | 'delete';
  showDataLinkDialog: boolean;
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
  proxiedPath: ProxiedPath | null;
  urls: OpenWithToolUrls | null;
  handleDeleteDataLink: (proxiedPath: ProxiedPath | null) => Promise<void>;
  pendingToolUrl?: PendingToolUrl;
  setPendingToolUrl?: React.Dispatch<React.SetStateAction<PendingToolUrl>>;
  handleCopyUrl?: (url: string) => Promise<void>;
  handleCreateDataLink?: (
    pendingToolUrl: PendingToolUrl,
    urls: OpenWithToolUrls | null,
    handleCopyUrl: ((url: string) => Promise<void>) | undefined,
    setPendingToolUrl:
      | React.Dispatch<React.SetStateAction<PendingToolUrl>>
      | undefined
  ) => Promise<void>;
};

function CreateLinkBtn({
  urls,
  pendingToolUrl,
  setPendingToolUrl,
  setShowDataLinkDialog,
  handleCopyUrl,
  handleCreateDataLink
}: {
  urls: OpenWithToolUrls | null;
  pendingToolUrl?: PendingToolUrl;
  setPendingToolUrl?: React.Dispatch<React.SetStateAction<PendingToolUrl>>;
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
  handleCopyUrl?: (url: string) => Promise<void>;
  handleCreateDataLink: (
    pendingToolUrl: PendingToolUrl,
    urls: OpenWithToolUrls | null,
    handleCopyUrl: ((url: string) => Promise<void>) | undefined,
    setPendingToolUrl:
      | React.Dispatch<React.SetStateAction<PendingToolUrl>>
      | undefined
  ) => Promise<void>;
}): JSX.Element {
  return (
    <Button
      variant="outline"
      color="error"
      className="!rounded-md flex items-center gap-2"
      onClick={async () => {
        if (pendingToolUrl) {
          await handleCreateDataLink(
            pendingToolUrl,
            urls,
            handleCopyUrl,
            setPendingToolUrl
          );
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
  setShowDataLinkDialog,
  handleDeleteDataLink
}: {
  proxiedPath: ProxiedPath | null;
  displayPath: string;
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
  handleDeleteDataLink: (proxiedPath: ProxiedPath | null) => Promise<void>;
}): JSX.Element {
  return (
    <Button
      variant="outline"
      color="error"
      className="!rounded-md flex items-center gap-2 hover:text-background focus:text-background"
      onClick={async () => {
        await handleDeleteDataLink(proxiedPath);
        setShowDataLinkDialog(false);
      }}
    >
      Delete Data Link
    </Button>
  );
}

function CancelBtn({
  setPendingToolUrl,
  setShowDataLinkDialog
}: {
  setPendingToolUrl?: React.Dispatch<React.SetStateAction<PendingToolUrl>>;
  setShowDataLinkDialog: React.Dispatch<React.SetStateAction<boolean>>;
}): JSX.Element {
  return (
    <Button
      variant="outline"
      className="!rounded-md flex items-center gap-2"
      onClick={() => {
        if (setPendingToolUrl) {
          setPendingToolUrl(null);
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
  urls,
  pendingToolUrl,
  setPendingToolUrl,
  handleCopyUrl,
  handleCreateDataLink,
  handleDeleteDataLink
}: DataLinkDialogProps): JSX.Element {
  const { fileBrowserState } = useFileBrowserContext();
  const { pathPreference, areDataLinksAutomatic } = usePreferencesContext();
  const { zonesAndFileSharePathsMap } = useZoneAndFspMapContext();

  const [localAreDataLinksAutomatic] = React.useState(areDataLinksAutomatic);

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

  if (action === 'create' && localAreDataLinksAutomatic) {
    return <></>;
  }

  return (
    <FgDialog
      open={showDataLinkDialog}
      onClose={() => {
        if (setPendingToolUrl) {
          setPendingToolUrl(null);
        }
        setShowDataLinkDialog(false);
      }}
    >
      <div className="flex flex-col gap-4 my-4">
        {action === 'create' &&
        !localAreDataLinksAutomatic &&
        handleCreateDataLink ? (
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
                urls={urls}
                pendingToolUrl={pendingToolUrl}
                setPendingToolUrl={setPendingToolUrl}
                setShowDataLinkDialog={setShowDataLinkDialog}
                handleCopyUrl={handleCopyUrl}
                handleCreateDataLink={handleCreateDataLink}
              />
              <CancelBtn
                setPendingToolUrl={setPendingToolUrl}
                setShowDataLinkDialog={setShowDataLinkDialog}
              />
            </BtnContainer>
          </>
        ) : action === 'delete' && localAreDataLinksAutomatic ? (
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
                handleDeleteDataLink={handleDeleteDataLink}
              />
              <CancelBtn
                setPendingToolUrl={setPendingToolUrl}
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
        ) : action === 'delete' && !localAreDataLinksAutomatic ? (
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
                handleDeleteDataLink={handleDeleteDataLink}
              />
              <CancelBtn
                setPendingToolUrl={setPendingToolUrl}
                setShowDataLinkDialog={setShowDataLinkDialog}
              />
            </BtnContainer>
          </>
        ) : null}
      </div>
    </FgDialog>
  );
}
