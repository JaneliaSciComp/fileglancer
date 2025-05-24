import React from 'react';
import {
  List,
  Collapse,
  Typography,
  IconButton
} from '@material-tailwind/react';
import {
  ChevronRightIcon,
  Squares2X2Icon,
  StarIcon as StarOutline
} from '@heroicons/react/24/outline';
import { StarIcon as StarFilled } from '@heroicons/react/24/solid';

import FileSharePathComponent from './FileSharePath';
import type { Zone } from '@/shared.types';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { makeMapKey } from '@/utils';

export default function Zone({
  zone,
  openZones,
  toggleOpenZones
}: {
  zone: Zone;
  openZones: Record<string, boolean>;
  toggleOpenZones: (zone: string) => void;
}) {
  const { zonePreferenceMap, handleFavoriteChange } = usePreferencesContext();

  const isOpen = openZones[zone.name] || false;
  const isFavoriteZone = makeMapKey('zone', zone.name) in zonePreferenceMap;

  return (
    <React.Fragment>
      <List.Item
        onClick={() => toggleOpenZones(zone.name)}
        className="overflow-x-auto cursor-pointer rounded-none py-1 x-short:py-0 short:py-0 flex-shrink-0 hover:!bg-primary-light/30 focus:!bg-primary-light/30 !bg-background"
      >
        <List.ItemStart>
          <Squares2X2Icon className="icon-small x-short:icon-xsmall" />
        </List.ItemStart>
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <Typography className="x-short:text-xs short:text-xs text-sm">
            {zone.name}
          </Typography>

          <div className="flex items-center" onClick={e => e.stopPropagation()}>
            <IconButton
              variant="ghost"
              isCircular
              onClick={() => handleFavoriteChange(zone, 'zone')}
            >
              {isFavoriteZone ? (
                <StarFilled className="icon-small x-short:icon-xsmall mb-[2px]" />
              ) : (
                <StarOutline className="icon-small x-short:icon-xsmall mb-[2px]" />
              )}
            </IconButton>
          </div>
        </div>
        <List.ItemEnd>
          <ChevronRightIcon
            className={`icon-small x-short:icon-xsmall ${isOpen ? 'rotate-90' : ''}`}
          />
        </List.ItemEnd>
      </List.Item>
      <Collapse open={isOpen}>
        <List className="bg-background !gap-0">
          {zone.fileSharePaths.map((fsp, index) => {
            return <FileSharePathComponent fsp={fsp} index={index} />;
          })}
        </List>
      </Collapse>
    </React.Fragment>
  );
}
