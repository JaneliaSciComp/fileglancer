/* eslint-disable react/destructuring-assignment */
// Props are used for TypeScript type narrowing purposes and cannot be destructured at the beginning

import { useState, SetStateAction } from 'react';
import type { ReactNode, Dispatch } from 'react';
import { Button, Typography } from '@material-tailwind/react';

import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { getPreferredPathForDisplay, makeMapKey } from '@/utils';
import type { FileSharePath } from '@/shared.types';
import type { PendingToolKey } from '@/hooks/useZarrMetadata';
import FgDialog from './FgDialog';
import TextWithFilePath from './TextWithFilePath';
import AutomaticLinksToggle from '@/components/ui/PreferencesPage/DataLinkOptions';
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
  const { pathPreference, areDataLinksAutomatic } = usePreferencesContext();
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
      <div className="flex flex-col gap-4 my-4">
        {props.action === 'create' && localAreDataLinksAutomatic ? (
          <> </>
        ) : props.action === 'create' && !localAreDataLinksAutomatic ? (
          <>
            <TextWithFilePath
              path={displayPath}
              text="Are you sure you want to create a data link for this path?"
            />
            <Typography className="text-foreground">
              If you share the data link with internal collaborators, they will
              be able to view these data.
            </Typography>
            <div className="flex flex-col gap-2">
              <Typography className="font-semibold text-foreground">
                Don't ask me this again:
              </Typography>
              <AutomaticLinksToggle checkboxesOnly />
            </div>
            <BtnContainer>
              <CreateLinkBtn onConfirm={props.onConfirm} />
              <CancelBtn onCancel={props.onCancel} />
            </BtnContainer>
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
