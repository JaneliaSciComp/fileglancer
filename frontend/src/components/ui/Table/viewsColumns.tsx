import { useMemo } from 'react';
import type { MouseEvent } from 'react';
import { Typography } from '@material-tailwind/react';
import type { ColumnDef } from '@tanstack/react-table';

import type { NeuroglancerShortLink } from '@/queries/neuroglancerQueries';
import { formatDateString } from '@/utils';
import FgTooltip from '../widgets/FgTooltip';
import DataLinksActionsMenu from '@/components/ui/Menus/DataLinksActions';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import toast from 'react-hot-toast';
import { copyToClipboard } from '@/utils/copyText';

const TRIGGER_CLASSES = 'h-min max-w-full';

type ViewRowActionProps = {
  item: NeuroglancerShortLink;
};

function ActionsCell({ item }: { readonly item: NeuroglancerShortLink }) {
  const menuItems: MenuItem<ViewRowActionProps>[] = [
    {
      name: 'Copy Neuroglancer URL',
      action: async ({ item }) => {
        const result = await copyToClipboard(item.neuroglancer_url);
        if (result.success) {
          toast.success('Neuroglancer URL copied');
        } else {
          toast.error(`Failed to copy: ${result.error}`);
        }
      }
    },
    {
      name: 'Copy state URL',
      action: async ({ item }) => {
        const result = await copyToClipboard(item.state_url);
        if (result.success) {
          toast.success('State URL copied');
        } else {
          toast.error(`Failed to copy: ${result.error}`);
        }
      }
    },
    {
      name: 'Copy short key',
      action: async ({ item }) => {
        const result = await copyToClipboard(item.short_key);
        if (result.success) {
          toast.success('Short key copied');
        } else {
          toast.error(`Failed to copy: ${result.error}`);
        }
      }
    }
  ];

  return (
    <div className="min-w-0 flex items-center">
      <div onClick={e => e.stopPropagation()}>
        <DataLinksActionsMenu<ViewRowActionProps>
          actionProps={{ item }}
          menuItems={menuItems}
        />
      </div>
    </div>
  );
}

export function useViewsColumns(): ColumnDef<NeuroglancerShortLink>[] {
  return useMemo(
    () => [
      {
        accessorKey: 'short_name',
        header: 'Name',
        cell: ({ row, table }) => {
          const item = row.original;
          const label = item.short_name || item.short_key;
          const onContextMenu = table.options.meta?.onCellContextMenu;
          return (
            <div
              className="flex items-center truncate w-full h-full"
              onContextMenu={e => {
                e.preventDefault();
                onContextMenu?.(e, { value: label });
              }}
            >
              <FgTooltip label={label} triggerClasses={TRIGGER_CLASSES}>
                <Typography className="text-foreground truncate select-all">
                  {label}
                </Typography>
              </FgTooltip>
            </div>
          );
        },
        sortingFn: (rowA, rowB) => {
          const a = rowA.original.short_name || rowA.original.short_key;
          const b = rowB.original.short_name || rowB.original.short_key;
          return a.localeCompare(b);
        },
        enableSorting: true
      },
      {
        accessorKey: 'neuroglancer_url',
        header: 'Neuroglancer URL',
        cell: ({ row, table }) => {
          const item = row.original;
          const onContextMenu = table.options.meta?.onCellContextMenu;
          return (
            <div
              className="flex items-center truncate w-full h-full"
              onContextMenu={(e: MouseEvent<HTMLElement>) => {
                e.preventDefault();
                onContextMenu?.(e, { value: item.neuroglancer_url });
              }}
            >
              <FgTooltip
                label={item.neuroglancer_url}
                triggerClasses={TRIGGER_CLASSES}
              >
                <Typography
                  as="a"
                  className="text-left truncate block text-primary-light hover:underline focus:underline"
                  href={item.neuroglancer_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {item.neuroglancer_url}
                </Typography>
              </FgTooltip>
            </div>
          );
        },
        enableSorting: false
      },
      {
        accessorKey: 'created_at',
        header: 'Date Created',
        cell: ({ cell, table }) => {
          const formattedDate = formatDateString(cell.getValue() as string);
          const onContextMenu = table.options.meta?.onCellContextMenu;
          return (
            <div
              className="flex items-center truncate w-full h-full"
              onContextMenu={e => {
                e.preventDefault();
                onContextMenu?.(e, { value: formattedDate });
              }}
            >
              <FgTooltip label={formattedDate} triggerClasses={TRIGGER_CLASSES}>
                <Typography
                  className="text-left text-foreground truncate select-all"
                  variant="small"
                >
                  {formattedDate}
                </Typography>
              </FgTooltip>
            </div>
          );
        },
        enableSorting: true
      },
      {
        accessorKey: 'short_key',
        header: 'Key',
        cell: ({ cell, getValue, table }) => {
          const key = getValue() as string;
          const onContextMenu = table.options.meta?.onCellContextMenu;
          return (
            <div
              className="flex items-center truncate w-full h-full"
              key={cell.id}
              onContextMenu={e => {
                e.preventDefault();
                onContextMenu?.(e, { value: key });
              }}
            >
              <FgTooltip label={key} triggerClasses={TRIGGER_CLASSES}>
                <Typography className="text-foreground truncate select-all">
                  {key}
                </Typography>
              </FgTooltip>
            </div>
          );
        },
        enableSorting: true
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => <ActionsCell item={row.original} />,
        enableSorting: false
      }
    ],
    []
  );
}
