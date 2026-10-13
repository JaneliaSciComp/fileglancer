import { useState } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from './FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import { useProxiedPathContext } from '@/contexts/ProxiedPathContext';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { defaultUrlPrefix } from '@/hooks/useDataToolLinks';
import { useRelinkViewsMutation } from '@/queries/viewQueries';
import type { FileSharePath } from '@/shared.types';
import { makeMapKey } from '@/utils';
import { normalizeFspRootPath } from '@/utils/pathHandling';

export type RelinkTarget = {
  fsp_name: string;
  path: string;
  displayPath: string;
};

type RelinkDialogProps = {
  readonly target: RelinkTarget | null;
  readonly onClose: () => void;
  readonly onRelinked?: () => void;
  /** False for a source with no recorded Data Link: it can only be removed. */
  readonly canRelink?: boolean;
  /** Offers removing the source from the View instead. Resolves when done. */
  readonly onRemove?: () => Promise<void>;
};

/**
 * Repair a broken source by pointing it at a Data Link for the same dataset.
 * Reuses the caller's existing link if they have one; otherwise creates one
 * (this dialog is the consent) — creation relinks server-side. With
 * `onRemove`, the source can be removed from the View instead.
 */
export default function RelinkDialog({
  target,
  onClose,
  onRelinked,
  canRelink = true,
  onRemove
}: RelinkDialogProps) {
  const { allProxiedPathsQuery, createProxiedPathMutation } =
    useProxiedPathContext();
  const { dataLinkSubpathMode } = usePreferencesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();
  const relinkMutation = useRelinkViewsMutation();
  const [pending, setPending] = useState(false);

  if (!target) {
    return null;
  }
  const path = normalizeFspRootPath(target.path);
  const existing = allProxiedPathsQuery.data?.find(
    p => p.fsp_name === target.fsp_name && normalizeFspRootPath(p.path) === path
  );

  const remove = async () => {
    setPending(true);
    try {
      await onRemove?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Remove failed');
    } finally {
      setPending(false);
    }
  };

  const run = async () => {
    setPending(true);
    try {
      if (existing) {
        await relinkMutation.mutateAsync(existing.sharing_key);
      } else {
        // Toast + View invalidation happen in the create mutation's onSuccess.
        const fsp = zonesAndFspQuery.data?.[
          makeMapKey('fsp', target.fsp_name)
        ] as FileSharePath | undefined;
        await createProxiedPathMutation.mutateAsync({
          fsp_name: target.fsp_name,
          path,
          url_prefix: defaultUrlPrefix(
            dataLinkSubpathMode,
            path,
            target.fsp_name,
            fsp?.linux_path
          )
        });
      }
      onRelinked?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Relink failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <FgDialog onClose={onClose} open>
      <div className="flex flex-col gap-3 my-4">
        <Typography className="text-foreground font-semibold">
          {onRemove ? 'Broken source' : 'Relink broken source'}
        </Typography>
        <Typography className="text-foreground text-sm">
          {canRelink
            ? `This data source's Data Link was deleted. Create a new data link to restore the data to this View and any other Views containing this source${onRemove ? ', or remove the source from this View' : ''}.`
            : "This data source's Data Link was deleted, and this View didn't record which link it used, so it can't be relinked. Remove the source from this View, or recreate the View."}
        </Typography>
        <Typography className="text-foreground text-sm font-mono break-all bg-surface/30 p-2 rounded">
          {target.displayPath}
        </Typography>
        <div className="flex gap-4">
          {canRelink ? (
            <FgButton
              disabled={
                pending ||
                !allProxiedPathsQuery.isSuccess ||
                !zonesAndFspQuery.isSuccess
              }
              onClick={() => void run()}
            >
              {existing
                ? 'Relink using existing Data Link'
                : 'Create Data Link'}
            </FgButton>
          ) : null}
          {onRemove ? (
            <FgButton
              color="error"
              disabled={pending}
              onClick={() => void remove()}
              variant={canRelink ? 'ghost' : 'solid'}
            >
              Remove from View
            </FgButton>
          ) : null}
          <FgButton onClick={onClose} variant="ghost">
            Cancel
          </FgButton>
        </div>
      </div>
    </FgDialog>
  );
}
