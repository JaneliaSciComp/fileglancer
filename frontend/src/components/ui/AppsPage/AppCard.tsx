import { useNavigate } from 'react-router';

import { Button, IconButton, Typography } from '@material-tailwind/react';
import { HiOutlinePlay, HiOutlineTrash } from 'react-icons/hi';

import FgTooltip from '@/components/ui/widgets/FgTooltip';
import type { UserApp } from '@/shared.types';

interface AppCardProps {
  readonly app: UserApp;
  readonly onRemove: (url: string) => void;
  readonly removing: boolean;
}

export default function AppCard({ app, onRemove, removing }: AppCardProps) {
  const navigate = useNavigate();

  const handleLaunch = () => {
    const encodedUrl = encodeURIComponent(app.url);
    navigate(`/apps/launch/${encodedUrl}`);
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
        <FgTooltip label="Remove app">
          <IconButton
            className="text-secondary hover:text-error flex-shrink-0"
            disabled={removing}
            onClick={() => onRemove(app.url)}
            size="sm"
            variant="ghost"
          >
            <HiOutlineTrash className="icon-default" />
          </IconButton>
        </FgTooltip>
      </div>

      <Button className="!rounded-md" onClick={handleLaunch} size="sm">
        <HiOutlinePlay className="icon-small mr-1" />
        Launch
      </Button>
    </div>
  );
}
