import { useMemo } from 'react';
import { IconButton, Typography } from '@material-tailwind/react';
import { HiOutlineTrash } from 'react-icons/hi';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import DatasetRow from '@/components/ui/Views/DatasetRow';
import { useCartDimensionCheck } from '@/hooks/useCartDimensionCheck';
import { useExpandAll } from '@/hooks/useExpandAll';
import { datasetKey } from '@/utils/pathHandling';
import type { CartItem } from '@/contexts/CartContext';
import type { LiveSource } from '@/hooks/useViewSources';

type SourcesListProps = {
  readonly sources: LiveSource[];
  readonly onRemove: (source: LiveSource) => void;
};

/** The datasets in the viewer, each with its metadata and a remove button. */
export default function SourcesList({ sources, onRemove }: SourcesListProps) {
  // Probes are cached per dataset, so these share the Add data tab's.
  const datasets = useMemo<CartItem[]>(
    () =>
      sources.flatMap(s =>
        s.fsp_name !== null && s.path !== null
          ? [{ fsp_name: s.fsp_name, path: s.path, label: s.label }]
          : []
      ),
    [sources]
  );
  const { mismatchedKeys, kindByKey } = useCartDimensionCheck(datasets);
  const { rowProps, toggle } = useExpandAll(
    datasets.map(ds => datasetKey(ds.fsp_name, ds.path)),
    'pt-2'
  );

  if (sources.length === 0) {
    return (
      <Typography className="text-foreground/70">
        No data in this View yet. Add datasets from the Add data tab.
      </Typography>
    );
  }

  return (
    <div className="flex flex-col">
      {datasets.length > 0 ? toggle : null}
      {sources.map(source =>
        source.fsp_name !== null && source.path !== null ? (
          <DatasetRow
            fsp_name={source.fsp_name}
            key={source.key}
            {...rowProps(datasetKey(source.fsp_name, source.path))}
            kind={
              kindByKey.get(datasetKey(source.fsp_name, source.path)) ??
              'loading'
            }
            label={source.label}
            mismatch={mismatchedKeys.has(
              datasetKey(source.fsp_name, source.path)
            )}
            onRemove={() => onRemove(source)}
            path={source.path}
            tense="present"
          />
        ) : (
          // A layer added in Neuroglancer itself: no dataset to describe.
          <div
            className="flex items-center justify-between gap-2 border-b border-surface py-2"
            key={source.key}
          >
            <Typography className="truncate pl-6 text-foreground">
              {source.label}
            </Typography>
            <IconButton
              aria-label="Remove layer"
              onClick={() => onRemove(source)}
              variant="ghost"
            >
              <FgIcon color="error" icon={HiOutlineTrash} size="sm" />
            </IconButton>
          </div>
        )
      )}
    </div>
  );
}
