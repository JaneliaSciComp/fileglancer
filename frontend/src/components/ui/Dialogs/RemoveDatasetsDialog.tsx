import { useState } from 'react';
import { Typography } from '@material-tailwind/react';
import toast from 'react-hot-toast';

import FgDialog from './FgDialog';
import FgButton from '@/components/designSystem/atoms/FgButton';
import FgCheckbox from '@/components/designSystem/atoms/formElements/FgCheckbox';
import {
  getViewSources,
  useSourceDisplayPath
} from '@/components/ui/Table/ngViewsColumns';
import { useViewsContext } from '@/contexts/ViewsContext';
import type { View } from '@/queries/viewQueries';
import { datasetKey } from '@/utils/pathHandling';

type RemoveDatasetsDialogProps = {
  readonly view: View;
  readonly onClose: () => void;
};

/** Pick which of a View's datasets to remove, with all their layers. */
export default function RemoveDatasetsDialog({
  view,
  onClose
}: RemoveDatasetsDialogProps) {
  const { removeViewSourcesMutation } = useViewsContext();
  const displayPath = useSourceDisplayPath();
  const sources = getViewSources(view);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });

  const handleRemove = async () => {
    try {
      await removeViewSourcesMutation.mutateAsync({
        short_key: view.short_key,
        sources: sources
          .filter(src => checked.has(datasetKey(src.fsp_name, src.path)))
          .map(({ fsp_name, path }) => ({ fsp_name, path }))
      });
      toast.success(
        `Removed ${checked.size} dataset${checked.size === 1 ? '' : 's'} from View`
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Remove failed');
    }
  };

  return (
    <FgDialog className="flex flex-col gap-4" onClose={onClose} open>
      <Typography className="text-foreground font-semibold">
        Remove datasets from "{view.name || view.short_key}"
      </Typography>
      {sources.length === 0 ? (
        <Typography className="text-foreground" variant="small">
          This View has no datasets to remove.
        </Typography>
      ) : (
        <>
          <Typography className="text-foreground" variant="small">
            All layers of the checked datasets will be removed from the View.
            The data itself is not affected.
          </Typography>
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto break-all">
            {sources.map(src => {
              const key = datasetKey(src.fsp_name, src.path);
              return (
                <FgCheckbox
                  checked={checked.has(key)}
                  key={key}
                  label={displayPath(src)}
                  onChange={() => toggle(key)}
                />
              );
            })}
          </div>
        </>
      )}
      <div className="flex gap-3">
        <FgButton
          color="error"
          disabled={checked.size === 0 || removeViewSourcesMutation.isPending}
          loading={removeViewSourcesMutation.isPending}
          loadingText="Removing..."
          onClick={handleRemove}
        >
          Remove
        </FgButton>
        <FgButton onClick={onClose} variant="ghost">
          Cancel
        </FgButton>
      </div>
    </FgDialog>
  );
}
