import { useMemo } from 'react';
import { Typography } from '@material-tailwind/react';
import type { ColumnDef } from '@tanstack/react-table';
import toast from 'react-hot-toast';

import type { View } from '@/queries/viewQueries';
import { downloadTextFile, formatDateString } from '@/utils';
import { constructNeuroglancerUrl } from '@/utils/neuroglancerUrl';
import { copyToClipboard } from '@/utils/copyText';
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

function ActionsCell({
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
  // ponytail: "Open" opens the external Neuroglancer URL for now; PR 6 repoints
  // it to the embedded /ngview/:read_key viewer.
  const menuItems: MenuItem<ViewRowActionProps>[] = [
    {
      name: 'Open in Neuroglancer',
      action: ({ item, baseUrl }) => {
        window.open(
          constructNeuroglancerUrl(item.ng_state, baseUrl),
          '_blank',
          'noopener,noreferrer'
        );
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
          <Typography className="text-foreground" variant="small">
            {getValue() as number}
          </Typography>
        ),
        enableSorting: true
      },
      {
        accessorKey: 'sharing_mode',
        header: 'Sharing',
        cell: ({ row }) => (
          <Typography className="text-foreground" variant="small">
            {SHARING_LABEL[row.original.sharing_mode]}
          </Typography>
        ),
        enableSorting: true
      },
      {
        accessorKey: 'updated_at',
        header: 'Updated',
        cell: ({ cell }) => (
          <Typography className="text-foreground truncate" variant="small">
            {formatDateString(cell.getValue() as string)}
          </Typography>
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
    [onRename, onDelete, baseUrl]
  );
}
