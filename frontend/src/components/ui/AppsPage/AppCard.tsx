import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Card, IconButton, Typography } from '@material-tailwind/react';
import { buildLaunchPathFromApp } from '@/utils';
import {
  HiOutlineInformationCircle,
  HiOutlinePlay,
  HiOutlineTrash
} from 'react-icons/hi';

import AppInfoDialog from '@/components/ui/AppsPage/AppInfoDialog';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import type { UserApp } from '@/shared.types';
import FgButton from '@/components/designSystem/atoms/FgButton';

interface AppCardProps {
  readonly app: UserApp;
  readonly onRemove: () => void;
  readonly onUpdate: (params: { url: string; manifest_path: string }) => void;
  readonly onShare: (params: {
    url: string;
    manifest_path: string;
    name: string;
    description: string;
  }) => Promise<void>;
  readonly onUnshare: () => void;
  readonly removing: boolean;
  readonly updating: boolean;
  readonly sharing: boolean;
  readonly unsharing: boolean;
}

export default function AppCard({
  app,
  onRemove,
  onUpdate,
  onShare,
  onUnshare,
  removing,
  updating,
  sharing,
  unsharing
}: AppCardProps) {
  const navigate = useNavigate();
  const [infoOpen, setInfoOpen] = useState(false);

  const isShared = app.listing_id !== undefined && app.listing_id !== null;

  const handleLaunch = () => {
    navigate(buildLaunchPathFromApp(app.url, app.manifest_path));
  };

  return (
    <Card className="p-4 flex flex-col gap-3 text-left w-full dark:border-surface-light">
      <div className="flex items-center justify-between">
        <Typography
          className="text-foreground font-semibold truncate"
          type="h6"
        >
          {app.name}
        </Typography>
        <div className="flex flex-shrink-0">
          <FgTooltip label="App info">
            <IconButton
              className="text-foreground hover:text-primary"
              onClick={() => setInfoOpen(true)}
              size="sm"
              variant="ghost"
            >
              <FgIcon icon={HiOutlineInformationCircle} />
            </IconButton>
          </FgTooltip>
          <FgTooltip label="Remove app">
            <IconButton
              className="text-foreground hover:text-error"
              disabled={removing}
              onClick={onRemove}
              size="sm"
              variant="ghost"
            >
              <FgIcon icon={HiOutlineTrash} />
            </IconButton>
          </FgTooltip>
        </div>
      </div>

      {isShared ? (
        <div>
          <span className="inline-block px-2 py-0.5 rounded-sm bg-success/10 text-success text-xs font-medium">
            Shared
          </span>
        </div>
      ) : null}

      {app.description ? (
        <Typography className="text-sm md:text-base text-foreground">
          {app.description}
        </Typography>
      ) : null}

      <FgButton
        className="self-start mt-auto"
        icon={HiOutlinePlay}
        onClick={handleLaunch}
        size="sm"
      >
        Launch
      </FgButton>

      <AppInfoDialog
        app={app}
        onClose={() => setInfoOpen(false)}
        onLaunch={() => {
          setInfoOpen(false);
          handleLaunch();
        }}
        onRemove={() => {
          setInfoOpen(false);
          onRemove();
        }}
        onShare={onShare}
        onUnshare={onUnshare}
        onUpdate={() =>
          onUpdate({ url: app.url, manifest_path: app.manifest_path })
        }
        open={infoOpen}
        removing={removing}
        sharing={sharing}
        unsharing={unsharing}
        updating={updating}
      />
    </Card>
  );
}
