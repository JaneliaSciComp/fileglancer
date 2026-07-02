import { Card, Typography } from '@material-tailwind/react';
import { HiOutlinePlay } from 'react-icons/hi';

import FgButton from '@/components/designSystem/atoms/FgButton';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import { getEntryPointIconType } from '@/utils';
import type { AppEntryPoint } from '@/shared.types';

interface EntryPointsListProps {
  readonly runnables: AppEntryPoint[];
  readonly onLaunch: (entryPoint: AppEntryPoint) => void;
}

/**
 * The "Entry Points" section of the app and listing detail pages: one card per
 * runnable with its type icon, description, and a Launch button.
 */
export default function EntryPointsList({
  runnables,
  onLaunch
}: EntryPointsListProps) {
  if (runnables.length === 0) {
    return null;
  }

  return (
    <>
      <Typography className="text-foreground font-semibold mb-3" type="h6">
        Entry Points
      </Typography>
      <div className="space-y-4">
        {runnables.map(ep => (
          <Card
            className="p-4 flex flex-col gap-2 text-left w-full dark:border-surface-light"
            key={ep.id}
          >
            <div className="flex items-center gap-2">
              <FgIcon
                className="text-foreground"
                icon={getEntryPointIconType(ep)}
              />
              <Typography className="text-foreground font-semibold">
                {ep.name}
              </Typography>
              {ep.type === 'service' ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-info/10 text-info border border-info/30">
                  Service
                </span>
              ) : null}
            </div>
            {ep.description ? (
              <Typography className="text-sm md:text-base text-foreground">
                {ep.description}
              </Typography>
            ) : null}
            <FgButton
              className="self-start"
              icon={HiOutlinePlay}
              onClick={() => onLaunch(ep)}
              size="sm"
            >
              Launch
            </FgButton>
          </Card>
        ))}
      </div>
    </>
  );
}
