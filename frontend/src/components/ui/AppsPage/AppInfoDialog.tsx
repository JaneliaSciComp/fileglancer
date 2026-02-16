import { Button, Typography } from '@material-tailwind/react';
import {
  HiExternalLink,
  HiOutlinePlay,
  HiOutlineRefresh,
  HiOutlineTrash
} from 'react-icons/hi';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import type { UserApp } from '@/shared.types';

interface AppInfoDialogProps {
  readonly app: UserApp;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onLaunch: () => void;
  readonly onUpdate: () => void;
  readonly onRemove: () => void;
  readonly updating: boolean;
  readonly removing: boolean;
}

function AppInfoTable({ app }: { readonly app: UserApp }) {
  const labelClass =
    'text-secondary font-medium pr-4 py-1.5 align-top whitespace-nowrap';
  const valueClass = 'text-foreground py-1.5';

  return (
    <table className="w-full text-sm mb-6">
      <tbody>
        <tr>
          <td className={labelClass}>URL</td>
          <td className="py-1.5">
            <a
              className="inline-flex items-center gap-1 text-primary hover:underline break-all"
              href={app.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              {app.url}
              <HiExternalLink className="icon-xsmall flex-shrink-0" />
            </a>
          </td>
        </tr>
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
  updating,
  removing
}: AppInfoDialogProps) {
  return (
    <FgDialog className="max-w-2xl" onClose={onClose} open={open}>
      <Typography className="text-foreground font-bold mb-4 pr-8" type="h6">
        {app.name}
      </Typography>

      <AppInfoTable app={app} />

      <div className="flex justify-between">
        <Button className="!rounded-md" onClick={onLaunch}>
          <HiOutlinePlay className="icon-small mr-2" />
          Launch
        </Button>
        <div className="flex gap-2">
          <Button
            className="!rounded-md"
            disabled={updating}
            onClick={onUpdate}
            variant="outline"
          >
            <HiOutlineRefresh className="icon-small mr-2" />
            {updating ? 'Updating...' : 'Update'}
          </Button>
          <Button
            className="!rounded-md"
            color="error"
            disabled={removing}
            onClick={onRemove}
            variant="outline"
          >
            <HiOutlineTrash className="icon-small mr-2" />
            Delete
          </Button>
        </div>
      </div>
    </FgDialog>
  );
}
