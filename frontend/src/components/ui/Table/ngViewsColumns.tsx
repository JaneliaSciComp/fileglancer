import { useMemo } from 'react';
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
    <div className="min-w-0 flex items-center">
      <div onClick={e => e.stopPropagation()}>
        <CardActionsMenu<ViewRowActionProps>
          actionProps={{ item, baseUrl, onRename, onDelete }}
          menuItems={menuItems}
        />
      </div>
    </div>
  );
}

export function useNGViewsColumns(
  onRename: (item: View) => void,
  onDelete: (item: View) => void,
  baseUrl: string
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
            <div className="flex items-center truncate w-full h-full">
              <FgTooltip label={label} triggerClasses={TRIGGER_CLASSES}>
                <Typography className="text-foreground truncate select-all">
                  {label}
                </Typography>
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
          <div className="flex items-center h-full">
            <Typography className="text-foreground" variant="small">
              {getValue() as number}
            </Typography>
          </div>
        ),
        enableSorting: true
      },
      {
        id: 'sources',
        header: 'Sources',
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
              <div className="flex items-center h-full">
                <Typography className="text-foreground/60" variant="small">
                  —
                </Typography>
              </div>
            );
          }
          return (
            <div className="flex flex-col justify-center gap-0.5 h-full min-w-0">
              {sources.map(src => (
                <Link
                  className="text-primary text-xs truncate hover:underline"
                  key={`${src.fsp_name}::${src.path}`}
                  onClick={e => e.stopPropagation()}
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
          <div className="flex items-center h-full">
            <Typography className="text-foreground" variant="small">
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
          <div className="flex items-center h-full">
            <Typography className="text-foreground truncate" variant="small">
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
    [onRename, onDelete, baseUrl, pathById]
  );
}
