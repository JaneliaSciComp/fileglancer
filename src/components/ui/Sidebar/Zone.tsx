import React from 'react';
import {
  List,
  Collapse,
  Typography,
  IconButton
} from '@material-tailwind/react';
import { HiChevronRight, HiOutlineStar, HiStar } from 'react-icons/hi';
import { HiOutlineSquares2X2 } from 'react-icons/hi2';
import toast from 'react-hot-toast';

import FileSharePathComponent from './FileSharePath';
import type { Zone } from '@/shared.types';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { makeMapKey } from '@/utils/index';

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
        className="pl-6 w-full flex items-center justify-between rounded-md cursor-pointer text-foreground hover:!bg-primary-light/30 focus:!bg-primary-light/30"
      >
        <List.ItemStart>
          <HiOutlineSquares2X2 className="icon-small short:icon-xsmall stroke-2" />
        </List.ItemStart>
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <Typography className="truncate short:text-xs text-sm font-semibold">
            {zone.name}
          </Typography>

          <div className="flex items-center" onClick={e => e.stopPropagation()}>
            <IconButton
              variant="ghost"
              isCircular
              onClick={async () => {
                const result = await handleFavoriteChange(zone, 'zone');
                if (!result.success) {
                  toast.error(`Failed to update favorites: ${result.error}`);
                }
              }}
            >
              {isFavoriteZone ? (
                <HiStar className="icon-small short:icon-xsmall mb-[2px]" />
              ) : (
                <HiOutlineStar className="icon-small short:icon-xsmall mb-[2px]" />
              )}
            </IconButton>
          </div>
        </div>
        <List.ItemEnd>
          <HiChevronRight
            className={`icon-small short:icon-xsmall ${isOpen ? 'rotate-90' : ''}`}
          />
        </List.ItemEnd>
      </List.Item>
      <Collapse open={isOpen}>
        <List className="file-share-path-list bg-background w-full !gap-0">
          {zone.fileSharePaths.map((fsp, index) => {
            return (
              <FileSharePathComponent key={fsp.name} fsp={fsp} index={index} />
            );
          })}
        </List>
      </Collapse>
    </React.Fragment>
  );
}
