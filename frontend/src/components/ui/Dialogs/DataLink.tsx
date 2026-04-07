/* eslint-disable react/destructuring-assignment */
// Props are used for TypeScript type narrowing purposes and cannot be destructured at the beginning

import { useState, SetStateAction } from 'react';
import type { ReactNode, Dispatch } from 'react';
import { Button, Typography } from '@material-tailwind/react';
import { Link } from 'react-router';

import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { getPreferredPathForDisplay, makeMapKey } from '@/utils';
import type { FileSharePath } from '@/shared.types';
import type { PendingToolKey } from '@/hooks/useZarrMetadata';
import FgDialog from './FgDialog';
import TextWithFilePath from './TextWithFilePath';
import DataLinkOptions from '@/components/ui/PreferencesPage/DataLinkOptions';
import DeleteBtn from '@/components/ui/buttons/DeleteBtn';

interface CommonDataLinkDialogProps {
  showDataLinkDialog: boolean;
  setShowDataLinkDialog: Dispatch<SetStateAction<boolean>>;
}

interface CreateLinkFromToolsProps extends CommonDataLinkDialogProps {
  tools: true;
  action: 'create';
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  setPendingToolKey: Dispatch<SetStateAction<PendingToolKey>>;
}

interface CreateLinkNotFromToolsProps extends CommonDataLinkDialogProps {
  tools: false;
  action: 'create';
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

interface DeleteLinkDialogProps extends CommonDataLinkDialogProps {
  action: 'delete';
  pending: boolean;
  proxiedPath: ProxiedPath;
  handleDeleteDataLink: (proxiedPath: ProxiedPath) => Promise<void>;
}

type DataLinkDialogProps =
  | CreateLinkFromToolsProps
  | CreateLinkNotFromToolsProps
  | DeleteLinkDialogProps;

function CreateLinkBtn({
  onConfirm
}: {
  readonly onConfirm: () => Promise<void>;
}) {
  return (
    <Button
      className="!rounded-md flex items-center gap-2"
      color="error"
      onClick={async () => {
        await onConfirm();
      }}
      variant="outline"
    >
      Create Data Link
    </Button>
  );
}

function CancelBtn({
  setPendingToolKey,
  setShowDataLinkDialog,
  onCancel
}: {
  readonly setPendingToolKey?: Dispatch<SetStateAction<PendingToolKey>>;
  readonly setShowDataLinkDialog?: Dispatch<SetStateAction<boolean>>;
  readonly onCancel?: () => void;
}) {
  return (
    <Button
      className="!rounded-md flex items-center gap-2"
      onClick={() => {
        if (onCancel) {
          onCancel();
        } else {
          if (setPendingToolKey) {
            setPendingToolKey(null);
          }
          if (setShowDataLinkDialog) {
            setShowDataLinkDialog(false);
          }
        }
      }}
      variant="outline"
    >
      <Typography>Cancel</Typography>
    </Button>
  );
}

function BtnContainer({ children }: { readonly children: ReactNode }) {
  return <div className="flex gap-4">{children}</div>;
}

export default function DataLinkDialog(props: DataLinkDialogProps) {
  const { fspName, filePath } = useFileBrowserContext();
  const {
    pathPreference,
    areDataLinksAutomatic,
    toggleAutomaticDataLinks,
    transparentDataLinks,
    toggleTransparentDataLinks
  } = usePreferencesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const [localAreDataLinksAutomatic] = useState(areDataLinksAutomatic);

  function getDisplayPath(): string {
    const fspKey =
      props.action === 'delete'
        ? makeMapKey('fsp', props.proxiedPath.fsp_name)
        : fspName
          ? makeMapKey('fsp', fspName)
          : '';

    const pathFsp =
      fspKey && zonesAndFspQuery.isSuccess
        ? (zonesAndFspQuery.data[fspKey] as FileSharePath)
        : null;
    const targetPath =
      props.action === 'delete' ? props.proxiedPath.path : filePath;

    return pathFsp && targetPath
      ? getPreferredPathForDisplay(pathPreference, pathFsp, targetPath)
      : '';
  }
  const displayPath = getDisplayPath();

  // Generate a preview data link URL
  const folderNameOnly = filePath ? filePath.split('/').pop() || filePath : '';
  const pathPortion = transparentDataLinks ? filePath || '' : folderNameOnly;
  const dataLinkPreview = `https://.../<key>/${pathPortion}`;

  return (
    <FgDialog
      onClose={() => {
        if (props.action === 'create' && props.tools) {
          props.setPendingToolKey(null);
        }
        props.setShowDataLinkDialog(false);
      }}
      open={props.showDataLinkDialog}
    >
      <div className="flex flex-col gap-2 my-4">
        {props.action === 'create' && localAreDataLinksAutomatic ? (
          <> </>
        ) : props.action === 'create' && !localAreDataLinksAutomatic ? (
          <>
            <Typography className="text-foreground font-semibold">
              Are you sure you want to create a data link?
            </Typography>
            <Typography className="text-foreground">
              If you share the data link with internal collaborators, they will
              be able to view these data.
            </Typography>
            <BtnContainer>
              <CreateLinkBtn onConfirm={props.onConfirm} />
              <CancelBtn onCancel={props.onCancel} />
            </BtnContainer>
            <div className="flex flex-col gap-2 mt-4">
              <Typography className="font-semibold text-foreground">
                Data link settings:
              </Typography>
              <DataLinkOptions checkboxesOnly />
              <Typography className="text-foreground text-sm font-mono break-all bg-surface/30 p-2 rounded">
                {dataLinkPreview}
              </Typography>
              <Typography className="text-xs text-foreground">
                You can always modify settings on the{' '}
                <Link className="text-primary underline" to="/preferences">
                  preferences page
                </Link>{' '}
                .
              </Typography>
            </div>
          </>
        ) : null}
        {props.action === 'delete' ? (
          <>
            <TextWithFilePath
              path={displayPath}
              text="Are you sure you want to delete the data link for this path?"
            />
            <Typography className="text-foreground">
              <span className="font-semibold">Warning:</span> The existing data
              link will be deleted. Collaborators with the link will no longer
              be able to use it to view these data. You can create a new data
              link at any time.
            </Typography>
            <BtnContainer>
              <DeleteBtn
                disabled={false}
                onClick={async () => {
                  await props.handleDeleteDataLink(props.proxiedPath);
                  props.setShowDataLinkDialog(false);
                }}
                pending={props.pending}
              />
              <CancelBtn setShowDataLinkDialog={props.setShowDataLinkDialog} />
            </BtnContainer>
          </>
        ) : null}
      </div>
    </FgDialog>
  );
}
