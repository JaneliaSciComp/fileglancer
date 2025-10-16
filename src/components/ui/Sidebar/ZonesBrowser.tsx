import { Collapse, Typography, List } from '@material-tailwind/react';
import { HiChevronRight } from 'react-icons/hi';
import { HiSquares2X2 } from 'react-icons/hi2';

import { ZonesAndFileSharePathsMap } from '@/shared.types';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import useOpenZones from '@/hooks/useOpenZones';
import Zone from './Zone';
import { SidebarItemSkeleton } from '@/components/ui/widgets/Loaders';
import { Link } from 'react-router';

export default function ZonesBrowser({
  searchQuery,
  filteredZonesMap
}: {
  readonly searchQuery: string;
  readonly filteredZonesMap: ZonesAndFileSharePathsMap;
}) {
  const { zonesAndFileSharePathsMap, areZoneDataLoading } =
    useZoneAndFspMapContext();
  const { isFilteredByGroups } = usePreferencesContext();
  const { openZones, toggleOpenZones } = useOpenZones();

  const displayZones: ZonesAndFileSharePathsMap =
    Object.keys(filteredZonesMap).length > 0 || searchQuery.length > 0
      ? filteredZonesMap
      : zonesAndFileSharePathsMap;

  return (
    <div className="flex flex-col my-1 mx-1">
      <List className="!min-w-20">
        <List.Item
          className="cursor-pointer rounded-md py-2 short:py-1 hover:!bg-surface-light focus:!bg-surface-light"
          onClick={() => toggleOpenZones('all')}
          role="button"
          tabIndex={0}
        >
          <List.ItemStart>
            <HiSquares2X2 className="icon-default short:icon-small text-surface-foreground" />
          </List.ItemStart>
          <Typography className="font-bold text-surface-foreground short:text-sm text-base">
            Zones
          </Typography>
          <List.ItemEnd>
            <HiChevronRight
              className={`icon-default short:icon-small ${openZones['all'] ? 'rotate-90' : ''}`}
            />
          </List.ItemEnd>
        </List.Item>
      </List>
      <Collapse
        className="overflow-x-hidden flex-grow w-full"
        open={openZones['all'] ? true : false}
      >
        {areZoneDataLoading ? (
          Array.from({ length: 10 }, (_, index) => (
            <SidebarItemSkeleton key={index} />
          ))
        ) : (
          <List className="h-full py-0 gap-0 bg-background">
            {searchQuery.length > 0 &&
            Object.keys(displayZones).length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Typography className="text-sm text-gray-500">
                  No zones match your filter '{searchQuery}'
                </Typography>
                <Typography className="text-xs text-gray-400 mt-1">
                  Try broadening your search to see more results
                </Typography>
              </div>
            ) : (
              Object.entries(displayZones).map(([key, value]) => {
                if (key.startsWith('zone') && 'fileSharePaths' in value) {
                  return (
                    <Zone
                      key={key}
                      openZones={openZones}
                      toggleOpenZones={toggleOpenZones}
                      zone={value}
                    />
                  );
                }
              })
            )}

            <div className="px-4 py-6 text-center">
              {isFilteredByGroups ? (
                <>
                  <Typography className="text-sm text-gray-500 border-t border-gray-200 pt-4">
                    Viewing Zones for your groups only
                  </Typography>
                  <Typography className="text-xs text-gray-400 mt-1">
                    Modify your{' '}
                    <Link className="text-primary underline" to="/preferences">
                      preferences
                    </Link>{' '}
                    to see all Zones
                  </Typography>
                </>
              ) : (
                <>
                  <Typography className="text-sm text-gray-500 border-t border-gray-200 pt-4">
                    Viewing all Zones
                  </Typography>
                  <Typography className="text-xs text-gray-400 mt-1">
                    Modify your{' '}
                    <Link className="text-primary underline" to="/preferences">
                      preferences
                    </Link>{' '}
                    to see Zones for your groups only
                  </Typography>
                </>
              )}
            </div>
          </List>
        )}
      </Collapse>
    </div>
  );
}
