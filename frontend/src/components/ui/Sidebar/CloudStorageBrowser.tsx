import { Fragment } from 'react';
import type { KeyboardEvent } from 'react';
import { Collapse, Typography, List } from '@material-tailwind/react';
import { HiChevronRight } from 'react-icons/hi';
import { HiOutlineCloud, HiOutlineSquares2X2, HiPlus } from 'react-icons/hi2';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import type { FileSharePath } from '@/shared.types';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { useCloudStorageConfigQuery } from '@/queries/cloudStorageQueries';
import useOpenZones from '@/hooks/useOpenZones';
import { isReadOnlyFsp } from '@/utils/cloudStorage';
import CloudBucketRow from './CloudBucketRow';

// Enter and Space activate an li with role="button", as they would a <button>
const onActivateKey = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
};

export default function CloudStorageBrowser({
  searchQuery,
  onAddBucket
}: {
  readonly searchQuery: string;
  readonly onAddBucket: () => void;
}) {
  const configQuery = useCloudStorageConfigQuery();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const { openZones, setOpenZones, toggleOpenZones } = useOpenZones();

  if (!configQuery.data?.enabled) {
    return null;
  }

  const buckets = Object.entries(zonesAndFspQuery.data || {})
    .filter(([key]) => key.startsWith('fsp_'))
    .map(([, value]) => value as FileSharePath)
    .filter(isReadOnlyFsp);
  const groups = [...new Set(['S3', ...buckets.map(fsp => fsp.zone)])];
  const query = searchQuery.toLowerCase();
  const visibleBuckets = query
    ? buckets.filter(fsp =>
        [fsp.storage, fsp.mount_path, fsp.zone].some(field =>
          field.toLowerCase().includes(query)
        )
      )
    : buckets;

  return (
    <div className="flex flex-col my-1 mx-1">
      <List className="!min-w-20">
        <List.Item
          aria-expanded={Boolean(openZones['all'])}
          className="cursor-pointer rounded-md py-2 short:py-1 hover:!bg-surface-light focus:!bg-surface-light"
          onClick={() => toggleOpenZones('all')}
          onKeyDown={onActivateKey(() => toggleOpenZones('all'))}
          role="button"
          tabIndex={0}
        >
          <List.ItemStart>
            <FgIcon
              className="short:icon-small text-surface-foreground"
              icon={HiOutlineCloud}
            />
          </List.ItemStart>
          <Typography className="font-bold text-surface-foreground short:text-sm text-base">
            Cloud Storage
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
        <List
          aria-label="List of cloud storage buckets"
          className="h-full py-0 gap-0 bg-background"
        >
          {groups.map(group => {
            const isOpen = openZones[group] ?? true;
            const toggleGroup = () =>
              setOpenZones(prev => ({
                ...prev,
                [group]: !(prev[group] ?? true)
              }));
            return (
              <Fragment key={group}>
                <List.Item
                  aria-expanded={isOpen}
                  className="pl-6 w-full flex items-center justify-between rounded-md cursor-pointer text-foreground hover:!bg-primary-light/30 focus:!bg-primary-light/30"
                  onClick={toggleGroup}
                  onKeyDown={onActivateKey(toggleGroup)}
                  role="button"
                  tabIndex={0}
                >
                  <List.ItemStart>
                    <FgIcon
                      className="short:icon-xsmall stroke-2"
                      icon={HiOutlineSquares2X2}
                      size="sm"
                    />
                  </List.ItemStart>
                  <div className="flex-1 min-w-0 flex items-center gap-1">
                    <Typography className="truncate short:text-xs text-sm font-semibold">
                      {group}
                    </Typography>
                  </div>
                  <List.ItemEnd>
                    <FgIcon
                      className={`short:icon-xsmall ${isOpen ? 'rotate-90' : ''}`}
                      icon={HiChevronRight}
                      size="sm"
                    />
                  </List.ItemEnd>
                </List.Item>
                <Collapse open={isOpen}>
                  <List className="file-share-path-list bg-background w-full !gap-0">
                    {visibleBuckets
                      .filter(fsp => fsp.zone === group)
                      .map(fsp => (
                        <CloudBucketRow fsp={fsp} key={fsp.name} />
                      ))}
                    <List.Item
                      aria-label="Add bucket"
                      className="file-share-path pl-6 w-full rounded-md cursor-pointer text-foreground hover:!bg-primary-light/30 focus:!bg-primary-light/30"
                      onClick={onAddBucket}
                      onKeyDown={onActivateKey(onAddBucket)}
                      role="button"
                      tabIndex={0}
                    >
                      <List.ItemStart>
                        <FgIcon
                          className="short:icon-xsmall stroke-2"
                          icon={HiPlus}
                          size="sm"
                        />
                      </List.ItemStart>
                      <Typography className="short:text-xs text-sm">
                        Add bucket
                      </Typography>
                    </List.Item>
                  </List>
                </Collapse>
              </Fragment>
            );
          })}
        </List>
      </Collapse>
    </div>
  );
}
