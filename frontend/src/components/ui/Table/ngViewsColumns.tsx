import { useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Typography } from '@material-tailwind/react';
import type { ColumnDef } from '@tanstack/react-table';
import toast from 'react-hot-toast';

import type { View } from '@/queries/viewQueries';
import { downloadTextFile, formatDateString, makeBrowseLink } from '@/utils';
import { constructNeuroglancerUrl } from '@/utils/neuroglancerUrl';
import { copyToClipboard } from '@/utils/copyText';
import { useAllProxiedPathsQuery } from '@/queries/proxiedPathQueries';
import FgTooltip from '../widgets/FgTooltip';
import CardActionsMenu from '@/components/ui/Menus/CardActionsMenu';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';

const TRIGGER_CLASSES = 'h-min max-w-full';

const SHARING_LABEL: Record<View['sharing_mode'], string> = {
  private: 'Private',
  read: 'Shared (read link)'
};

type ViewRowActionProps = {
  item: View;
  baseUrl: string;
  onRename: (item: View) => void;
  onDelete: (item: View) => void;
};

export function ActionsCell({
  item,
  baseUrl,
  onRename,
  onDelete
}: {
  readonly item: View;
  readonly baseUrl: string;
  readonly onRename: (item: View) => void;
  readonly onDelete: (item: View) => void;
}) {
  const navigate = useNavigate();
  // ponytail: "Open" now navigates client-side to the embedded /view/:read_key
  // viewer instead of opening the external Neuroglancer URL.
  const menuItems: MenuItem<ViewRowActionProps>[] = [
    {
      name: 'Open in Neuroglancer',
      action: ({ item }) => {
        navigate(`/view/${item.read_key}`);
      }
    },
    {
      name: 'Copy Neuroglancer link',
      action: async ({ item, baseUrl }) => {
        const result = await copyToClipboard(
          constructNeuroglancerUrl(item.ng_state, baseUrl)
        );
        if (result.success) {
          toast.success('Neuroglancer link copied');
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
          actionProps={{ item, baseUrl, onRename, onDelete }}
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
  baseUrl: string,
  sourcesColWidth: number,
  onSourcesResize: (next: number) => void
): ColumnDef<View>[] {
  // Views listed here are the current user's own, so their backing Data Links
  // are in this (current-user-scoped) query. Layers whose Data Link is missing
  // or broken simply don't resolve to a browse link.
  const proxiedPathsQuery = useAllProxiedPathsQuery();
  const pathById = useMemo(() => {
    const map = new Map<number, { fsp_name: string; path: string }>();
    for (const p of proxiedPathsQuery.data ?? []) {
      map.set(p.id, { fsp_name: p.fsp_name, path: p.path });
    }
    return map;
  }, [proxiedPathsQuery.data]);

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
        accessorFn: row => row.layers.length,
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
          const seen = new Set<string>();
          const sources: { fsp_name: string; path: string }[] = [];
          for (const layer of row.original.layers) {
            const src =
              layer.data_link_id !== null
                ? pathById.get(layer.data_link_id)
                : undefined;
            if (!src) {
              continue;
            }
            const key = `${src.fsp_name}::${src.path}`;
            if (!seen.has(key)) {
              seen.add(key);
              sources.push(src);
            }
          }
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
              {sources.map(src => (
                <Link
                  className="block max-w-full truncate text-primary text-xs text-left hover:underline"
                  key={`${src.fsp_name}::${src.path}`}
                  onClick={e => e.stopPropagation()}
                  title={src.path}
                  to={makeBrowseLink(src.fsp_name, src.path)}
                >
                  {src.path}
                </Link>
              ))}
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
            baseUrl={baseUrl}
            item={row.original}
            onDelete={onDelete}
            onRename={onRename}
          />
        ),
        enableSorting: false
      }
    ],
    [onRename, onDelete, baseUrl, pathById, sourcesColWidth, onSourcesResize]
  );
}
