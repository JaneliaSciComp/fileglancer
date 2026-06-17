import { Typography } from '@material-tailwind/react';
import { HiOutlineClipboardCopy } from 'react-icons/hi';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
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

export type DataLinkType = 'directory' | 'file' | 'ome-zarr' | 'zarr' | 'n5';
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
  const currentFileOrFolder = targetFileQuery.data?.currentFileOrFolder;
  const isFile =
    !targetFileQuery.isPending && currentFileOrFolder?.is_dir === false;
  const files = targetFileQuery.data?.files ?? [];

  const zarrVersions = detectZarrVersions(files);
  const isZarr = !isFile && zarrVersions.length > 0;
  const isN5 = !isFile && detectN5(files);

  // Reuse the zarr metadata query — TanStack Query caches by key,
  // so this is a no-op when the browse page already fetched it.
  // Skip for files: we don't need zarr metadata for a single file.
  const zarrMetadataQuery = useZarrMetadataQuery({
    fspName,
    currentFileOrFolder: isFile ? undefined : currentFileOrFolder,
    files: isFile ? [] : files
  });

  const zarrVersion: ZarrVersion | undefined = isZarr
    ? zarrVersions.includes('v3')
      ? 3
      : 2
    : undefined;

  // Determine data type: file check takes precedence over Zarr/N5 detection.
  // For zarr, wait for metadata query to distinguish OME vs plain.
  let dataType: DataLinkType;
  if (isFile) {
    dataType = 'file';
  } else if (isZarr) {
    dataType = zarrMetadataQuery.data?.isOmeZarr ? 'ome-zarr' : 'zarr';
  } else if (isN5) {
    dataType = 'n5';
  } else {
    dataType = 'directory';
  }

  const isPending =
    targetFileQuery.isPending ||
    (!isFile && isZarr && zarrMetadataQuery.isPending);

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
            <FgIcon
              className="text-foreground shrink-0"
              icon={HiOutlineClipboardCopy}
            />
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
