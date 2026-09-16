import { useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Typography } from '@material-tailwind/react';
import type { ColumnDef } from '@tanstack/react-table';
import toast from 'react-hot-toast';

import type { View } from '@/queries/viewQueries';
import {
  downloadTextFile,
  formatDateString,
  getPreferredPathForDisplay,
  makeBrowseLink,
  makeMapKey
} from '@/utils';
import { datasetKey } from '@/utils/pathHandling';
import { isUnsupportedLayer } from '@/utils/viewCheckout';
import { copyToClipboard } from '@/utils/copyText';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import FgTooltip from '../widgets/FgTooltip';
import FgIcon from '@/components/designSystem/atoms/FgIcon';
import CardActionsMenu from '@/components/ui/Menus/CardActionsMenu';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import type { FileSharePath } from '@/shared.types';
import { MdLinkOff } from 'react-icons/md';
import { HiExclamationTriangle } from 'react-icons/hi2';

const TRIGGER_CLASSES = 'h-min max-w-full';

const SHARING_LABEL: Record<View['sharing_mode'], string> = {
  private: 'Private',
  read: 'Shared (read link)'
};

type ViewRowActionProps = {
  item: View;
  onRename: (item: View) => void;
  onDelete: (item: View) => void;
};

export function ActionsCell({
  item,
  onRename,
  onDelete
}: {
  readonly item: View;
  readonly onRename: (item: View) => void;
  readonly onDelete: (item: View) => void;
}) {
  const navigate = useNavigate();
  // ponytail: "Open" now navigates client-side to the embedded /view/:read_key
  // viewer instead of opening the external Neuroglancer URL.
  const menuItems: MenuItem<ViewRowActionProps>[] = [
    {
      name: 'Open View',
      action: ({ item }) => {
        navigate(`/view/${item.read_key}`);
      }
    },
    {
      name: 'Copy View link to share',
      action: async ({ item }) => {
        const result = await copyToClipboard(
          `${window.location.origin}/view/${item.read_key}`
        );
        if (result.success) {
          toast.success('View link copied');
        } else {
          toast.error(`Failed to copy: ${result.error}`);
        }
      }
    },
    {
      name: 'Download JSON state',
      action: ({ item }) => {
        downloadTextFile(
          JSON.stringify(item.ng_state, null, 2),
          `${item.name || item.short_key}.json`
        );
      }
    },
    {
      name: 'Rename',
      action: ({ item, onRename }) => {
        onRename(item);
      }
    },
    {
      name: 'Delete',
      color: 'text-error',
      action: ({ item, onDelete }) => {
        onDelete(item);
      }
    }
  ];

  return (
    <div className="min-w-0 flex items-center justify-start">
      <div onClick={e => e.stopPropagation()}>
        <CardActionsMenu<ViewRowActionProps>
          actionProps={{ item, onRename, onDelete }}
          menuItems={menuItems}
        />
      </div>
    </div>
  );
}

// ponytail: drag handle for the Sources column. Local drag state lives in
// refs (start-x, start-width) so re-renders during drag don't reset it;
// pointer capture is via document mousemove/mouseup listeners bound at
// mousedown, so releasing outside the header still ends the drag.
function SourcesResizeHandle({
  sourcesColWidth,
  onResize
}: {
  readonly sourcesColWidth: number;
  readonly onResize: (next: number) => void;
}) {
  const startX = useRef(0);
  const startWidth = useRef(sourcesColWidth);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    // Header row toggles sort on click; keep the drag from also sorting.
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startWidth.current = sourcesColWidth;
    setIsDragging(true);
    const onMove = (ev: globalThis.MouseEvent) => {
      onResize(startWidth.current + (ev.clientX - startX.current));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
      setIsDragging(false);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      aria-hidden="true"
      className={`cursor-col-resize absolute z-10 -right-1 top-0 h-full w-3 bg-transparent group/resize ${isDragging ? 'is-dragging' : ''}`}
      onClick={e => e.stopPropagation()}
      onMouseDown={handleMouseDown}
    >
      <div className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-surface-foreground/50 group-hover/resize:bg-primary group-hover/resize:w-[3px] group-[.is-dragging]/resize:bg-primary group-[.is-dragging]/resize:w-[3px]" />
    </div>
  );
}

export function useNGViewsColumns(
  onRename: (item: View) => void,
  onDelete: (item: View) => void,
  sourcesColWidth: number,
  onSourcesResize: (next: number) => void
): ColumnDef<View>[] {
  const { pathPreference } = usePreferencesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  return useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => {
          const item = row.original;
          const label = item.name || item.short_key;
          return (
            <div className="flex items-center justify-start truncate w-full h-full text-left">
              <FgTooltip label={label} triggerClasses={TRIGGER_CLASSES}>
                <Link
                  className="text-primary truncate text-left hover:underline"
                  to={`/view/${item.read_key}`}
                >
                  {label}
                </Link>
              </FgTooltip>
            </div>
          );
        },
        sortingFn: (a, b) =>
          (a.original.name || a.original.short_key).localeCompare(
            b.original.name || b.original.short_key
          ),
        enableSorting: true
      },
      {
        id: 'layers',
        header: 'Layers',
        accessorFn: row =>
          row.layers.filter(layer => !isUnsupportedLayer(layer)).length,
        cell: ({ getValue }) => (
          <div className="flex items-center justify-start h-full text-left">
            <Typography className="text-foreground text-left" variant="small">
              {getValue() as number}
            </Typography>
          </div>
        ),
        enableSorting: true
      },
      {
        id: 'sources',
        header: () => (
          <div className="relative flex items-center w-full h-full text-left select-none">
            <span>Sources</span>
            <SourcesResizeHandle
              onResize={onSourcesResize}
              sourcesColWidth={sourcesColWidth}
            />
          </div>
        ),
        cell: ({ row }) => {
          // De-dupe: per-channel layers of one dataset share a source path.
          // A source is broken if any of its layers lost its Data Link, and
          // unsupported if every layer of it produced no Neuroglancer layer.
          const bySource = new Map<
            string,
            {
              fsp_name: string;
              path: string;
              broken: boolean;
              unsupported: boolean;
            }
          >();
          for (const layer of row.original.layers) {
            if (layer.fsp_name === null || layer.path === null) {
              continue; // pre-migration broken layer: source unknown
            }
            const key = datasetKey(layer.fsp_name, layer.path);
            const existing = bySource.get(key);
            const unsupported = isUnsupportedLayer(layer);
            if (existing) {
              existing.broken = existing.broken || layer.broken;
              existing.unsupported = existing.unsupported && unsupported;
            } else {
              bySource.set(key, {
                fsp_name: layer.fsp_name,
                path: layer.path,
                broken: layer.broken,
                unsupported
              });
            }
          }
          const sources = [...bySource.values()];
          if (sources.length === 0) {
            return (
              <div className="flex items-center justify-start h-full w-full text-left">
                <Typography
                  className="text-foreground/60 text-left"
                  variant="small"
                >
                  —
                </Typography>
              </div>
            );
          }
          return (
            <div className="flex flex-col justify-center gap-0.5 h-full w-full min-w-0 text-left">
              {sources.map(src => {
                const fsp = zonesAndFspQuery.data?.[
                  makeMapKey('fsp', src.fsp_name)
                ] as FileSharePath | undefined;
                const fullPath =
                  getPreferredPathForDisplay(pathPreference, fsp, src.path) ||
                  src.path;
                return (
                  <div
                    className="flex items-center gap-1 min-w-0"
                    key={datasetKey(src.fsp_name, src.path)}
                  >
                    {src.broken ? (
                      <FgTooltip label="Data link deleted; source no longer appears in View">
                        <FgIcon
                          color="error"
                          icon={MdLinkOff}
                          label="Data link missing"
                          size="sm"
                        />
                      </FgTooltip>
                    ) : src.unsupported ? (
                      <FgTooltip label="Will not load as a Neuroglancer layer">
                        <FgIcon
                          color="warning"
                          icon={HiExclamationTriangle}
                          label="Will not load as a Neuroglancer layer"
                          size="sm"
                        />
                      </FgTooltip>
                    ) : null}
                    <Link
                      className="block max-w-full truncate text-primary text-xs text-left hover:underline"
                      onClick={e => e.stopPropagation()}
                      title={fullPath}
                      to={makeBrowseLink(src.fsp_name, src.path)}
                    >
                      {fullPath}
                    </Link>
                  </div>
                );
              })}
            </div>
          );
        },
        enableSorting: false
      },
      {
        accessorKey: 'sharing_mode',
        header: 'Sharing',
        cell: ({ row }) => (
          <div className="flex items-center justify-start h-full text-left">
            <Typography className="text-foreground text-left" variant="small">
              {SHARING_LABEL[row.original.sharing_mode]}
            </Typography>
          </div>
        ),
        enableSorting: true
      },
      {
        accessorKey: 'updated_at',
        header: 'Updated',
        cell: ({ cell }) => (
          <div className="flex items-center justify-start h-full text-left">
            <Typography
              className="text-foreground truncate text-left"
              variant="small"
            >
              {formatDateString(cell.getValue() as string)}
            </Typography>
          </div>
        ),
        enableSorting: true
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <ActionsCell
            item={row.original}
            onDelete={onDelete}
            onRename={onRename}
          />
        ),
        enableSorting: false
      }
    ],
    [
      onRename,
      onDelete,
      sourcesColWidth,
      onSourcesResize,
      pathPreference,
      zonesAndFspQuery.data
    ]
  );
}
