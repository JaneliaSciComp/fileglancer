import { Breadcrumb } from '@material-tailwind/react';
import { HiChevronRight, HiOutlineSquares2X2 } from 'react-icons/hi2';

import BreadcrumbSegment from '@/components/ui/BrowsePage/BreadcrumbSegment';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { makePathSegmentArray, joinPaths } from '@/utils/pathHandling';
import { makeMapKey, getPreferredPathForDisplay } from '@/utils';
import type { FileSharePath, Zone } from '@/shared.types';
import type { FileSelectorLocation } from '@/hooks/useFileSelector';

type FileSelectorBreadcrumbsProps = {
  readonly currentLocation: FileSelectorLocation;
  readonly zonesData: Record<string, FileSharePath | Zone> | undefined;
  readonly onNavigate: (location: FileSelectorLocation) => void;
};

export default function FileSelectorBreadcrumbs({
  currentLocation,
  zonesData,
  onNavigate
}: FileSelectorBreadcrumbsProps) {
  const { pathPreference } = usePreferencesContext();

  const buildBreadcrumbs = () => {
    const segments: { label: string; location: FileSelectorLocation }[] = [];

    // Always start with zones
    segments.push({ label: 'Zones', location: { type: 'zones' } });

    if (currentLocation.type === 'zone') {
      // Add zone segment
      const zoneKey = makeMapKey('zone', currentLocation.zoneId);
      const zone = zonesData?.[zoneKey] as Zone;
      if (zone) {
        segments.push({
          label: zone.name,
          location: { type: 'zone', zoneId: currentLocation.zoneId }
        });
      }
    } else if (currentLocation.type === 'filesystem') {
      // Add FSP and path segments
      const fspKey = makeMapKey('fsp', currentLocation.fspName);
      const fsp = zonesData?.[fspKey] as FileSharePath;

      if (fsp) {
        // Add zone segment
        segments.push({
          label: fsp.zone,
          location: { type: 'zone', zoneId: fsp.zone }
        });

        // Add FSP segment
        segments.push({
          label: getPreferredPathForDisplay(pathPreference, fsp),
          location: {
            type: 'filesystem',
            fspName: currentLocation.fspName,
            path: '.'
          }
        });

        // Add folder path segments if not at root
        if (currentLocation.path && currentLocation.path !== '.') {
          const pathSegments = makePathSegmentArray(currentLocation.path);
          pathSegments.forEach((segment, index) => {
            if (segment) {
              const path = joinPaths(...pathSegments.slice(0, index + 1));
              segments.push({
                label: segment,
                location: {
                  type: 'filesystem',
                  fspName: currentLocation.fspName,
                  path
                }
              });
            }
          });
        }
      }
    }

    return segments;
  };

  const segments = buildBreadcrumbs();

  return (
    <div className="w-full py-2 px-3 border-b border-surface">
      <Breadcrumb className="bg-transparent p-0">
        <div className="flex items-center gap-1 h-5">
          <HiOutlineSquares2X2 className="icon-default text-primary-light" />
          <HiChevronRight className="icon-default" />
        </div>

        {segments.map((segment, index) => {
          const isLast = index === segments.length - 1;

          return (
            <BreadcrumbSegment
              isLast={isLast}
              key={segment.label + '-' + index}
              label={segment.label}
              onClick={isLast ? undefined : () => onNavigate(segment.location)}
              pathPreference={pathPreference}
            />
          );
        })}
      </Breadcrumb>
    </div>
  );
}
