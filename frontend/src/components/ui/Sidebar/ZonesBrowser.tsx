import { Collapse, Typography, List } from '@material-tailwind/react';
import { HiChevronRight } from 'react-icons/hi';
import { HiSquares2X2 } from 'react-icons/hi2';
import toast from 'react-hot-toast';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import { ZonesAndFileSharePathsMap } from '@/shared.types';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import useOpenZones from '@/hooks/useOpenZones';
import Zone from './Zone';
import { SidebarItemSkeleton } from '@/components/ui/widgets/Loaders';
import FgLink from '@/components/designSystem/atoms/FgLink';
import FgSwitch from '@/components/designSystem/atoms/formElements/FgSwitch';

export default function ZonesBrowser({
  searchQuery,
  filteredZonesMap,
  hasResultsOutsideGroups
}: {
  readonly searchQuery: string;
  readonly filteredZonesMap: ZonesAndFileSharePathsMap;
  readonly hasResultsOutsideGroups: boolean;
}) {
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const { isFilteredByGroups, toggleFilterByGroups } = usePreferencesContext();
  const { openZones, toggleOpenZones } = useOpenZones();

  const displayZones: ZonesAndFileSharePathsMap =
    Object.keys(filteredZonesMap).length > 0 || searchQuery.length > 0
      ? filteredZonesMap
      : zonesAndFspQuery.data || {};

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
            <FgIcon
              className="short:icon-small text-surface-foreground"
              icon={HiSquares2X2}
            />
          </List.ItemStart>
          <Typography className="font-bold text-surface-foreground short:text-sm text-base">
            Zones
          </Typography>
          <List.ItemEnd>
            <FgIcon
              className={`short:icon-small ${openZones['all'] ? 'rotate-90' : ''}`}
              icon={HiChevronRight}
            />
          </List.ItemEnd>
        </List.Item>
      </List>
      <Collapse
        className="overflow-x-hidden flex-grow w-full"
        open={openZones['all'] ? true : false}
      >
        {zonesAndFspQuery.isPending ? (
          Array.from({ length: 10 }, (_, index) => (
            <SidebarItemSkeleton key={index} />
          ))
        ) : (
          <List
            aria-label="List of file share paths within zone"
            className="h-full py-0 gap-0 bg-background"
          >
            {searchQuery.length > 0 &&
            Object.keys(displayZones).length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Typography className="text-sm text-foreground/60">
                  No zones match your filter &apos;{searchQuery}&apos;
                </Typography>
                {hasResultsOutsideGroups ? (
                  <div className="mt-3 px-2 py-3 bg-surface rounded-md text-left">
                    <Typography className="text-xs text-foreground/70">
                      Results exist in Zones outside your groups.
                    </Typography>
                    <Typography className="text-xs text-foreground mt-2">
                      Change your zone display preferences to view:
                    </Typography>
                    <div className="flex items-center gap-2 mt-2">
                      <FgSwitch
                        checked={isFilteredByGroups}
                        id="sidebar_is_filtered_by_groups"
                        label="Display Zones for your groups only"
                        onChange={async () => {
                          const result = await toggleFilterByGroups();
                          if (result.success) {
                            toast.success('All Zones are now visible');
                          } else {
                            toast.error(result.error);
                          }
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <Typography className="text-xs text-foreground/60 mt-1">
                    Try broadening your search to see more results
                  </Typography>
                )}
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
                  <Typography className="text-sm text-foreground/70 border-t border-surface pt-4">
                    Viewing Zones for your groups only
                  </Typography>
                  <Typography className="text-xs text-foreground/60 mt-1">
                    Modify your{' '}
                    <FgLink size="xs" to="/preferences">
                      preferences
                    </FgLink>{' '}
                    to see all Zones
                  </Typography>
                </>
              ) : (
                <>
                  <Typography className="text-sm text-foreground/70 border-t border-surface pt-4">
                    Viewing all Zones
                  </Typography>
                  <Typography className="text-xs text-foreground/60 mt-1">
                    Modify your{' '}
                    <FgLink size="xs" to="/preferences">
                      preferences
                    </FgLink>{' '}
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
