import { useState, useMemo } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';
import type { ColumnDef } from '@tanstack/react-table';

import DataLinksActionsMenu from '@/components/ui/Menus/DataLinksActions';
import NeuroglancerLinkDialog from '@/components/ui/Dialogs/NeuroglancerLinkDialog';
import { formatDateString } from '@/utils';
import type { NeuroglancerLink } from '@/queries/ngLinkQueries';
import type { MenuItem } from '@/components/ui/Menus/FgMenuItems';
import FgTooltip from '../widgets/FgTooltip';

const TRIGGER_CLASSES = 'h-min max-w-full';

type NgLinkActionProps = {
  link: NeuroglancerLink;
  onEdit: () => void;
  onDelete: () => void;
};

function ActionsCell({ link }: { readonly link: NeuroglancerLink }) {
  const [dialogMode, setDialogMode] = useState<'edit' | 'delete' | null>(null);

  const handleCopyShortUrl = async () => {
    if (link.short_url) {
      await navigator.clipboard.writeText(link.short_url);
      toast.success('Short URL copied to clipboard!');
    }
  };

  const handleOpenLink = () => {
    if (link.short_url) {
      window.open(link.short_url, '_blank');
    }
  };

  const menuItems: MenuItem<NgLinkActionProps>[] = [
    {
      name: 'Copy short URL',
      action: async () => {
        await handleCopyShortUrl();
      }
    },
    {
      name: 'Open in Neuroglancer',
      action: () => {
        handleOpenLink();
      }
    },
    {
      name: 'Edit',
      action: (props: NgLinkActionProps) => props.onEdit()
    },
    {
      name: 'Delete',
      action: (props: NgLinkActionProps) => props.onDelete(),
      color: 'text-red-600'
    }
  ];

  const actionProps: NgLinkActionProps = {
    link,
    onEdit: () => setDialogMode('edit'),
    onDelete: () => setDialogMode('delete')
  };

  return (
    <div
      className="min-w-0 flex items-center"
      data-testid="ng-link-actions-cell"
      key={`action-${link.short_key}`}
    >
      <div onClick={e => e.stopPropagation()}>
        <DataLinksActionsMenu<NgLinkActionProps>
          actionProps={actionProps}
          menuItems={menuItems}
        />
      </div>
      {dialogMode === 'edit' ? (
        <NeuroglancerLinkDialog
          link={link}
          mode="edit"
          onClose={() => setDialogMode(null)}
          open={true}
        />
      ) : null}
      {dialogMode === 'delete' ? (
        <NeuroglancerLinkDialog
          link={link}
          mode="delete"
          onClose={() => setDialogMode(null)}
          open={true}
        />
      ) : null}
    </div>
  );
}

export function useNgLinksColumns(): ColumnDef<NeuroglancerLink>[] {
  return useMemo(
    () => [
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ cell, row, table }) => {
          const link = row.original;
          const displayTitle = link.title || `Link ${link.short_key}`;
          const onContextMenu = table.options.meta?.onCellContextMenu;
          return (
            <div
              className="flex items-center truncate w-full h-full"
              key={cell.id}
              onContextMenu={e => {
                e.preventDefault();
                onContextMenu?.(e, { value: displayTitle });
              }}
            >
              <FgTooltip label={displayTitle} triggerClasses={TRIGGER_CLASSES}>
                <Typography className="text-foreground truncate select-all">
                  {displayTitle}
                </Typography>
              </FgTooltip>
            </div>
          );
        },
        enableSorting: true
      },
      {
        accessorKey: 'short_url',
        header: 'Short URL',
        cell: ({ cell, getValue, table }) => {
          const url = getValue() as string | null;
          const onContextMenu = table.options.meta?.onCellContextMenu;

          const handleCopy = async () => {
            if (url) {
              await navigator.clipboard.writeText(url);
              toast.success('Short URL copied to clipboard!');
            }
          };

          return (
            <div
              className="flex items-center truncate w-full h-full cursor-pointer"
              key={cell.id}
              onClick={handleCopy}
              onContextMenu={e => {
                e.preventDefault();
                onContextMenu?.(e, { value: url || '' });
              }}
            >
              <FgTooltip
                label={url ? `${url} (click to copy)` : 'No URL available'}
                triggerClasses={TRIGGER_CLASSES}
              >
                <Typography className="text-foreground truncate select-all font-mono text-sm">
                  {url || '-'}
                </Typography>
              </FgTooltip>
            </div>
          );
        },
        enableSorting: false
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ cell, getValue, table }) => {
          const dateStr = getValue() as string;
          const formattedDate = formatDateString(dateStr);
          const onContextMenu = table.options.meta?.onCellContextMenu;
          return (
            <div
              className="flex items-center truncate w-full h-full"
              key={cell.id}
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
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => <ActionsCell link={row.original} />,
        enableSorting: false
      }
    ],
    []
  );
}
