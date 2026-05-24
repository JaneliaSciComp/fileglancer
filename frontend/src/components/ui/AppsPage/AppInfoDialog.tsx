import { Typography } from '@material-tailwind/react';
import {
  HiOutlinePlay,
  HiOutlineRefresh,
  HiOutlineShare,
  HiOutlineTrash
} from 'react-icons/hi';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import type { UserApp } from '@/shared.types';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgExternalLink from '@/components/designSystem/atoms/FgExternalLink';

interface AppInfoDialogProps {
  readonly app: UserApp;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onLaunch: () => void;
  readonly onUpdate: () => void;
  readonly onRemove: () => void;
  readonly onShare: () => void;
  readonly onUnshare: () => void;
  readonly updating: boolean;
  readonly removing: boolean;
  readonly unsharing: boolean;
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
        {app.manifest?.version ? (
          <tr>
            <td className={labelClass}>Version</td>
            <td className={valueClass}>{app.manifest.version}</td>
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
  unsharing
}: AppInfoDialogProps) {
  const isShared = app.listing_id !== undefined && app.listing_id !== null;

  return (
    <FgDialog className="max-w-2xl" onClose={onClose} open={open}>
      <Typography className="text-foreground font-bold mb-4 pr-8" type="h6">
        {app.name}
      </Typography>

      <AppInfoTable app={app} />

      <div className="flex justify-between">
        <FgButton icon={HiOutlinePlay} onClick={onLaunch}>
          Launch
        </FgButton>
        <div className="flex gap-2">
          {isShared ? (
            <FgButton
              disabled={unsharing}
              icon={HiOutlineShare}
              loading={unsharing}
              loadingText="Unsharing..."
              onClick={onUnshare}
              variant="outline"
            >
              Unshare
            </FgButton>
          ) : (
            <FgButton icon={HiOutlineShare} onClick={onShare} variant="outline">
              Share to Catalog
            </FgButton>
          )}
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
          <FgButton
            className="!rounded-md"
            color="error"
            disabled={removing}
            icon={HiOutlineTrash}
            loading={removing}
            loadingText="Deleting..."
            onClick={onRemove}
            variant="outline"
          >
            Delete
          </FgButton>
        </div>
      </div>
    </FgDialog>
  );
}
