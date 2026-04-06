import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button, Card, IconButton, Typography } from '@material-tailwind/react';
import { buildLaunchPathFromApp } from '@/utils';
import {
  HiOutlineInformationCircle,
  HiOutlinePlay,
  HiOutlineTrash
} from 'react-icons/hi';

import AppInfoDialog from '@/components/ui/AppsPage/AppInfoDialog';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import type { UserApp } from '@/shared.types';

interface AppCardProps {
  readonly app: UserApp;
  readonly onRemove: (params: { url: string; manifest_path: string }) => void;
  readonly onUpdate: (params: { url: string; manifest_path: string }) => void;
  readonly removing: boolean;
  readonly updating: boolean;
}

export default function AppCard({
  app,
  onRemove,
  onUpdate,
  removing,
  updating
}: AppCardProps) {
  const navigate = useNavigate();
  const [infoOpen, setInfoOpen] = useState(false);

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
              <HiOutlineInformationCircle className="icon-default" />
            </IconButton>
          </FgTooltip>
          <FgTooltip label="Remove app">
            <IconButton
              className="text-foreground hover:text-error"
              disabled={removing}
              onClick={() =>
                onRemove({
                  url: app.url,
                  manifest_path: app.manifest_path
                })
              }
              size="sm"
              variant="ghost"
            >
              <HiOutlineTrash className="icon-default" />
            </IconButton>
          </FgTooltip>
        </div>
      </div>
      {app.description ? (
        <Typography className="text-sm md:text-base text-foreground">
          {app.description}
        </Typography>
      ) : null}

      <Button
        className="!rounded-md self-start mt-auto"
        onClick={handleLaunch}
        size="sm"
      >
        <HiOutlinePlay className="icon-small mr-1" />
        Launch
      </Button>

      <AppInfoDialog
        app={app}
        onClose={() => setInfoOpen(false)}
        onLaunch={() => {
          setInfoOpen(false);
          handleLaunch();
        }}
        onRemove={() => {
          setInfoOpen(false);
          onRemove({ url: app.url, manifest_path: app.manifest_path });
        }}
        onUpdate={() =>
          onUpdate({ url: app.url, manifest_path: app.manifest_path })
        }
        open={infoOpen}
        removing={removing}
        updating={updating}
      />
    </Card>
  );
}
