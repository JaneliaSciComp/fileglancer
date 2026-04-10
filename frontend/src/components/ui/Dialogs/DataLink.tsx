/* eslint-disable react/destructuring-assignment */
// Props are used for TypeScript type narrowing purposes and cannot be destructured at the beginning

import { useState, useMemo, SetStateAction } from 'react';
import type { ReactNode, Dispatch } from 'react';
import { Button, Typography } from '@material-tailwind/react';
import { Link } from 'react-router';

import type { ProxiedPath } from '@/contexts/ProxiedPathContext';
import { useFileBrowserContext } from '@/contexts/FileBrowserContext';
import { validateUrlPrefix } from '@/hooks/useDataToolLinks';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { makeMapKey } from '@/utils';
import {
  getPreferredPathForDisplay,
  joinPaths,
  normalizePosixStylePath
} from '@/utils/pathHandling';
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
  onConfirm: (urlPrefixOverride?: string) => Promise<void>;
  onCancel: () => void;
  setPendingToolKey: Dispatch<SetStateAction<PendingToolKey>>;
}

interface CreateLinkNotFromToolsProps extends CommonDataLinkDialogProps {
  tools: false;
  action: 'create';
  onConfirm: (urlPrefixOverride?: string) => Promise<void>;
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
  onConfirm,
  disabled
}: {
  readonly onConfirm: () => Promise<void>;
  readonly disabled?: boolean;
}) {
  return (
    <Button
      className="!rounded-md flex items-center gap-2"
      color="error"
      disabled={disabled}
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
  const { pathPreference, areDataLinksAutomatic, dataLinkSubpathMode } =
    usePreferencesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const [localAreDataLinksAutomatic] = useState(areDataLinksAutomatic);

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

  function getDisplayPath(): string {
    const targetPath =
      props.action === 'delete' ? props.proxiedPath.path : filePath;

    return pathFsp && targetPath
      ? getPreferredPathForDisplay(pathPreference, pathFsp, targetPath)
      : '';
  }
  const displayPath = getDisplayPath();

  // Generate preview components
  const folderNameOnly = filePath ? filePath.split('/').pop() || filePath : '';
  const linuxPath = pathFsp?.linux_path;
  const transparentPath =
    linuxPath && filePath
      ? normalizePosixStylePath(joinPaths(linuxPath, filePath))
      : filePath || '';

  // Custom subpath local state (only used in this dialog, not persisted)
  const [customSubpath, setCustomSubpath] = useState(folderNameOnly);

  const customSubpathError = useMemo(
    () =>
      dataLinkSubpathMode === 'custom'
        ? validateUrlPrefix(customSubpath)
        : null,
    [customSubpath, dataLinkSubpathMode]
  );

  // Compute preview based on current mode
  function getPreviewPath(): string {
    switch (dataLinkSubpathMode) {
      case 'full_path':
        return transparentPath;
      case 'custom':
        return customSubpath;
      case 'name':
      default:
        return folderNameOnly;
    }
  }
  const dataLinkPreview = `https://.../<key>/${getPreviewPath()}`;

  // Whether this dialog was triggered by automatic+custom mode
  const isAutoCustom =
    props.action === 'create' &&
    localAreDataLinksAutomatic &&
    dataLinkSubpathMode === 'custom';

  const handleConfirmWithPrefix = async () => {
    if (props.action !== 'create') {
      return;
    }
    if (dataLinkSubpathMode === 'custom') {
      await props.onConfirm(customSubpath);
    } else {
      await props.onConfirm();
    }
  };

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
        {props.action === 'create' && isAutoCustom ? (
          <>
            <Typography className="text-foreground font-semibold">
              Set data link name
            </Typography>
            <Typography className="text-foreground">
              Enter the name for your data link:
            </Typography>
            <input
              className={`w-full p-2 rounded border bg-surface text-foreground font-mono text-sm ${customSubpathError ? 'border-error' : 'border-outline'}`}
              onChange={e => setCustomSubpath(e.target.value)}
              type="text"
              value={customSubpath}
            />
            {customSubpathError ? (
              <Typography className="text-error text-xs">
                {customSubpathError}
              </Typography>
            ) : null}
            <Typography className="text-foreground text-sm font-mono break-all bg-surface/30 p-2 rounded">
              {dataLinkPreview}
            </Typography>
            <BtnContainer>
              <CreateLinkBtn
                disabled={!!customSubpathError}
                onConfirm={handleConfirmWithPrefix}
              />
              <CancelBtn onCancel={props.onCancel} />
            </BtnContainer>
            <Typography className="text-xs text-foreground">
              You're seeing this because you enabled custom data link naming in
              your{' '}
              <Link className="text-primary underline" to="/preferences">
                preferences
              </Link>
              .
            </Typography>
          </>
        ) : props.action === 'create' &&
          localAreDataLinksAutomatic &&
          dataLinkSubpathMode !== 'custom' ? (
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
              <CreateLinkBtn
                disabled={!!customSubpathError}
                onConfirm={handleConfirmWithPrefix}
              />
              <CancelBtn onCancel={props.onCancel} />
            </BtnContainer>
            <div className="flex flex-col gap-2 mt-4">
              <Typography className="font-semibold text-foreground">
                Data link settings:
              </Typography>
              <DataLinkOptions checkboxesOnly />
              {dataLinkSubpathMode === 'custom' ? (
                <>
                  <input
                    className={`w-full p-2 rounded border bg-surface text-foreground font-mono text-sm ${customSubpathError ? 'border-error' : 'border-outline'}`}
                    onChange={e => setCustomSubpath(e.target.value)}
                    type="text"
                    value={customSubpath}
                  />
                  {customSubpathError ? (
                    <Typography className="text-error text-xs">
                      {customSubpathError}
                    </Typography>
                  ) : null}
                </>
              ) : null}
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
