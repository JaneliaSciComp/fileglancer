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
};

/**
 * Repair a broken source by pointing it at a Data Link for the same dataset.
 * Reuses the caller's existing link if they have one; otherwise creates one
 * (this dialog is the consent) — creation relinks server-side.
 */
export default function RelinkDialog({
  target,
  onClose,
  onRelinked
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
          Relink broken source
        </Typography>
        <Typography className="text-foreground text-sm">
          This data source's Data Link was deleted. Create a new data link to
          restore the data to this View and any other Views containing this
          source.
        </Typography>
        <Typography className="text-foreground text-sm font-mono break-all bg-surface/30 p-2 rounded">
          {target.displayPath}
        </Typography>
        <div className="flex gap-4">
          <FgButton
            disabled={pending || !zonesAndFspQuery.isSuccess}
            onClick={() => void run()}
          >
            {existing ? 'Relink using existing Data Link' : 'Create Data Link'}
          </FgButton>
          <FgButton onClick={onClose} variant="ghost">
            Cancel
          </FgButton>
        </div>
      </div>
    </FgDialog>
  );
}
