import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button, IconButton, Typography } from '@material-tailwind/react';
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
    navigate('/apps/launch/app', {
      state: { appUrl: app.url, manifestPath: app.manifest_path }
    });
  };

  return (
    <div className="border border-primary-light rounded-lg p-4 bg-background hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <Typography
            className="text-foreground font-semibold truncate"
            type="h6"
          >
            {app.name}
          </Typography>
          {app.description ? (
            <Typography
              className="text-secondary mt-1 line-clamp-2"
              type="small"
            >
              {app.description}
            </Typography>
          ) : null}
        </div>
        <div className="flex flex-shrink-0">
          <FgTooltip label="App info">
            <IconButton
              className="text-secondary hover:text-primary"
              onClick={() => setInfoOpen(true)}
              size="sm"
              variant="ghost"
            >
              <HiOutlineInformationCircle className="icon-default" />
            </IconButton>
          </FgTooltip>
          <FgTooltip label="Remove app">
            <IconButton
              className="text-secondary hover:text-error"
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

      <Button className="!rounded-md" onClick={handleLaunch} size="sm">
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
    </div>
  );
}
