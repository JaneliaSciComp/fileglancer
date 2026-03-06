import { Typography } from '@material-tailwind/react';
import { HiOutlineClipboardCopy } from 'react-icons/hi';

import FgDialog from '@/components/ui/Dialogs/FgDialog';
import TabsSkeleton from '@/components/ui/Dialogs/dataLinkUsage/TabsSkeleton';
import DataLinkTabs from '@/components/ui/Dialogs/dataLinkUsage/tabsContent/DataLinkTabs';
import CopyTooltip from '@/components/ui/widgets/CopyTooltip';
import useFileQuery from '@/queries/fileQueries';
import {
  detectZarrVersions,
  useZarrMetadataQuery
} from '@/queries/zarrQueries';
import { detectN5 } from '@/queries/n5Queries';

export type DataLinkType = 'directory' | 'ome-zarr' | 'zarr' | 'n5';
export type ZarrVersion = 2 | 3;

const TOOLTIP_TRIGGER_CLASSES =
  'text-foreground/50 hover:text-foreground py-1 px-2';

type DataLinkUsageDialogProps = {
  readonly dataLinkUrl: string;
  readonly fspName: string;
  readonly path: string;
  readonly open: boolean;
  readonly onClose: () => void;
};

export default function DataLinkUsageDialog({
  dataLinkUrl,
  fspName,
  path,
  open,
  onClose
}: DataLinkUsageDialogProps) {
  const targetFileQuery = useFileQuery(fspName, path);
  const files = targetFileQuery.data?.files ?? [];

  const zarrVersions = detectZarrVersions(files);
  const isZarr = zarrVersions.length > 0;
  const isN5 = detectN5(files);

  // Reuse the zarr metadata query — TanStack Query caches by key,
  // so this is a no-op when the browse page already fetched it
  const zarrMetadataQuery = useZarrMetadataQuery({
    fspName,
    currentFileOrFolder: targetFileQuery.data?.currentFileOrFolder,
    files
  });

  const zarrVersion: ZarrVersion | undefined = isZarr
    ? zarrVersions.includes('v3')
      ? 3
      : 2
    : undefined;

  // Determine data type: for zarr, wait for metadata query to distinguish OME vs plain
  let dataType: DataLinkType;
  if (isZarr) {
    dataType = zarrMetadataQuery.data?.isOmeZarr ? 'ome-zarr' : 'zarr';
  } else if (isN5) {
    dataType = 'n5';
  } else {
    dataType = 'directory';
  }

  const isPending =
    targetFileQuery.isPending || (isZarr && zarrMetadataQuery.isPending);

  return (
    <FgDialog
      className="max-w-4xl w-11/12 md:w-11/12 lg:w-10/12 dark:bg-surface"
      onClose={onClose}
      open={open}
    >
      <div className="flex flex-col gap-4 my-4 min-h-0 max-h-[85vh]">
        <Typography className="text-foreground font-semibold text-lg w-[95%] self-center">
          How to use your data link
        </Typography>
        <div className="flex items-center gap-2 w-[95%] self-center border border-surface rounded-lg px-3 py-2 bg-surface-light overflow-hidden">
          <span className="text-foreground text-sm font-mono truncate flex-1 min-w-0">
            {dataLinkUrl}
          </span>
          <CopyTooltip
            primaryLabel="Copy data link"
            textToCopy={dataLinkUrl}
            tooltipTriggerClasses={TOOLTIP_TRIGGER_CLASSES}
          >
            <HiOutlineClipboardCopy className="icon-default text-foreground shrink-0" />
          </CopyTooltip>
        </div>
        {isPending ? (
          <TabsSkeleton />
        ) : (
          <DataLinkTabs
            dataLinkUrl={dataLinkUrl}
            dataType={dataType}
            key={`${dataType}-${zarrVersion}`}
            tooltipTriggerClasses={TOOLTIP_TRIGGER_CLASSES}
            zarrVersion={zarrVersion}
          />
        )}
      </div>
    </FgDialog>
  );
}
