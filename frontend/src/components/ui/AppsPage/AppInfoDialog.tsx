import { useEffect, useState } from 'react';
import { Typography } from '@material-tailwind/react';
import {
  HiOutlinePlay,
  HiOutlineRefresh,
  HiOutlineTrash
} from 'react-icons/hi';
import { FaUsers, FaUsersSlash } from 'react-icons/fa6';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import type { UserApp } from '@/shared.types';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';
import FgTooltip from '@/components/ui/widgets/FgTooltip';

interface AppInfoDialogProps {
  readonly app: UserApp;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onLaunch: () => void;
  readonly onUpdate: () => void;
  readonly onRemove: () => void;
  readonly onShare: (params: {
    url: string;
    manifest_path: string;
    name: string;
    description: string;
  }) => Promise<void>;
  readonly onUnshare: () => void;
  readonly updating: boolean;
  readonly removing: boolean;
  readonly sharing: boolean;
  readonly unsharing: boolean;
  readonly startInShareView?: boolean;
}

function AppInfoTable({ app }: { readonly app: UserApp }) {
  const labelClass =
    'text-foreground font-medium pr-4 py-1.5 align-top whitespace-nowrap';
  const valueClass = 'text-foreground py-1.5';

  return (
    <table className="w-full text-sm mb-6">
      <tbody>
        <tr>
          <td className={labelClass}>URL</td>
          <td className="py-1.5">
            <FgExternalLink className="break-all" href={app.url}>
              {app.url}
            </FgExternalLink>
          </td>
        </tr>
        {app.branch ? (
          <tr>
            <td className={labelClass}>Branch</td>
            <td className={valueClass}>{app.branch}</td>
          </tr>
        ) : null}
        {app.description ? (
          <tr>
            <td className={labelClass}>Description</td>
            <td className={valueClass}>{app.description}</td>
          </tr>
        ) : null}
        {app.manifest?.runnables && app.manifest.runnables.length > 0 ? (
          <tr>
            <td className={labelClass}>Entry Points</td>
            <td className={valueClass}>
              {app.manifest.runnables.map(ep => ep.name).join(', ')}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export default function AppInfoDialog({
  app,
  open,
  onClose,
  onLaunch,
  onUpdate,
  onRemove,
  onShare,
  onUnshare,
  updating,
  removing,
  sharing,
  unsharing,
  startInShareView = false
}: AppInfoDialogProps) {
  const isShared = app.listing_id !== undefined && app.listing_id !== null;

  // The share form is shown as an inline view within this dialog (rather than a
  // separate stacked dialog) so the dialog stays open throughout sharing.
  const [shareView, setShareView] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shareError, setShareError] = useState('');

  const openShareForm = () => {
    setName(app.name);
    setDescription(app.description ?? '');
    setShareError('');
    setShareView(true);
  };

  // Open into the share form when requested (and shareable), otherwise always
  // return to the info view when the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      if (startInShareView && !isShared) {
        openShareForm();
      } else {
        setShareView(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleShareSubmit = async () => {
    if (!name.trim()) {
      setShareError('Name is required');
      return;
    }
    try {
      await onShare({
        url: app.url,
        manifest_path: app.manifest_path,
        name: name.trim(),
        description: description.trim()
      });
      setShareView(false);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Failed to share');
    }
  };

  return (
    <FgDialog className="max-w-2xl" onClose={onClose} open={open}>
      {shareView ? (
        <>
          <Typography className="text-foreground font-bold mb-4 pr-8" type="h6">
            Share to Catalog
          </Typography>
          <Typography className="mb-4 text-foreground text-sm">
            Publish this app so other users can add it to their own collection.
            You can customize the name and description before sharing without
            affecting your own copy.
          </Typography>

          <div className="mb-3">
            <label className="block text-foreground text-sm font-medium mb-1">
              Name
            </label>
            <input
              autoFocus
              className="w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary"
              onChange={e => {
                setName(e.target.value);
                setShareError('');
              }}
              type="text"
              value={name}
            />
          </div>

          <div className="mb-4">
            <label className="block text-foreground text-sm font-medium mb-1">
              Description
              <span className="text-foreground font-normal ml-1">
                (optional)
              </span>
            </label>
            <textarea
              className="w-full p-2 text-foreground border rounded-sm focus:outline-none bg-background border-primary-light focus:border-primary"
              onChange={e => setDescription(e.target.value)}
              rows={3}
              value={description}
            />
          </div>

          {shareError ? (
            <Typography className="text-error mb-3" type="small">
              {shareError}
            </Typography>
          ) : null}

          <div className="flex gap-3">
            <FgButton
              disabled={!name.trim() || sharing}
              icon={FaUsers}
              loading={sharing}
              loadingText="Sharing..."
              onClick={handleShareSubmit}
            >
              Share
            </FgButton>
            <FgButton onClick={() => setShareView(false)} variant="ghost">
              Cancel
            </FgButton>
          </div>
        </>
      ) : (
        <>
          <Typography className="text-foreground font-bold mb-4 pr-8" type="h6">
            {app.name}
          </Typography>

          <AppInfoTable app={app} />

          <div className="flex justify-between">
            <FgTooltip label="Launch this app">
              <FgButton icon={HiOutlinePlay} onClick={onLaunch}>
                Launch
              </FgButton>
            </FgTooltip>
            <div className="flex gap-2">
              {isShared ? (
                <FgTooltip label="Unshare from catalog">
                  <FgButton
                    disabled={unsharing}
                    icon={FaUsersSlash}
                    loading={unsharing}
                    loadingText="Unsharing..."
                    onClick={onUnshare}
                    variant="outline"
                  >
                    Unshare
                  </FgButton>
                </FgTooltip>
              ) : (
                <FgTooltip label="Share to catalog">
                  <FgButton
                    icon={FaUsers}
                    onClick={openShareForm}
                    variant="outline"
                  >
                    Share to Catalog
                  </FgButton>
                </FgTooltip>
              )}
              <FgTooltip label="Update to the latest version">
                <FgButton
                  disabled={updating}
                  icon={HiOutlineRefresh}
                  loading={updating}
                  loadingText="Updating..."
                  onClick={onUpdate}
                  variant="outline"
                >
                  Update
                </FgButton>
              </FgTooltip>
              <FgTooltip label="Remove from my apps">
                <FgButton
                  className="!rounded-md"
                  color="error"
                  disabled={removing}
                  icon={HiOutlineTrash}
                  loading={removing}
                  loadingText="Removing..."
                  onClick={onRemove}
                  variant="outline"
                >
                  Remove
                </FgButton>
              </FgTooltip>
            </div>
          </div>
        </>
      )}
    </FgDialog>
  );
}
