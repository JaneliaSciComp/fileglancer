import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Collapse, IconButton, Typography } from '@material-tailwind/react';
import {
  HiChevronRight,
  HiOutlineCheckCircle,
  HiOutlineTrash
} from 'react-icons/hi';
import { HiExclamationTriangle } from 'react-icons/hi2';
import toast from 'react-hot-toast';

import FgIcon from '@/components/designSystem/atoms/FgIcon';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import ZarrAxisTable from '@/components/ui/BrowsePage/ZarrAxisTable';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import useZoneAndFileSharePathMapQuery from '@/queries/zoneAndFileSharePathMapQuery';
import { getOmeZarrChannels, getOmeZarrMetadata } from '@/omezarr-helper';
import type { Metadata } from '@/omezarr-helper';
import {
  getPreferredPathForDisplay,
  makeBrowseLink,
  makeMapKey
} from '@/utils';
import { getFileURL } from '@/utils/pathHandling';
import type { FileSharePath } from '@/shared.types';
import type { DatasetKind } from '@/utils/viewCheckout';

interface DatasetRowProps {
  readonly fsp_name: string;
  readonly path: string;
  readonly label: string;
  readonly mismatch?: boolean;
  readonly kind: DatasetKind | 'loading';
  /** Whether the layer status reads "will load" (cart) or "loads" (View). */
  readonly tense?: 'future' | 'present';
  readonly onRemove: () => void;
  /** Controls expansion from the list (expand all); uncontrolled if unset. */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  /** Shown under the axes once the dataset's channels have loaded. */
  readonly renderChannels?: (channels: string[]) => ReactNode;
}

const loads = {
  icon: HiOutlineCheckCircle,
  color: 'success',
  label: {
    future: 'Will load as a Neuroglancer layer',
    present: 'Loads as a Neuroglancer layer'
  }
} as const;
const LAYER_STATUS = {
  ome: loads,
  array: loads,
  unsupported: {
    icon: HiExclamationTriangle,
    color: 'warning',
    label: {
      future: 'Will not load as a Neuroglancer layer',
      present: "Can't load as a Neuroglancer layer"
    }
  }
} as const;

// ponytail: two-level dataset->channel tree via MT Collapse (no generic
// TreeView exists). Metadata/channels are fetched from the internal
// /api/content URL (credentialed), so no Data Link is required to inspect
// dimensions or pick channels. Non-Zarr/N5 datasets fail gracefully in
// getOmeZarrChannels (toast) instead of a hard pre-check.
export default function DatasetRow({
  fsp_name,
  path,
  label,
  mismatch,
  kind,
  tense = 'future',
  onRemove,
  open,
  onOpenChange,
  renderChannels
}: DatasetRowProps) {
  const { pathPreference } = usePreferencesContext();
  const zonesAndFspQuery = useZoneAndFileSharePathMapQuery();
  const fsp = zonesAndFspQuery.data?.[makeMapKey('fsp', fsp_name)] as
    | FileSharePath
    | undefined;
  // Full filesystem path (FSP mount + subpath); falls back to the bare
  // subpath until the FSP map has loaded.
  const displayPath = fsp
    ? getPreferredPathForDisplay(pathPreference, fsp, path)
    : path;
  const [openState, setOpenState] = useState(false);
  const isOpen = open ?? openState;
  const setIsOpen = onOpenChange ?? setOpenState;
  const [channels, setChannels] = useState<string[] | undefined>(undefined);
  const [metadata, setMetadata] = useState<Metadata | null | undefined>(
    undefined
  );

  // Fetch once, on first open (by this row or by expand all).
  const requested = useRef(false);
  useEffect(() => {
    if (!isOpen || requested.current) {
      return;
    }
    requested.current = true;
    const dataUrl = getFileURL(fsp_name, path);
    getOmeZarrChannels(dataUrl)
      .then(setChannels)
      .catch(error => {
        toast.error(
          error instanceof Error ? error.message : 'Failed to load channels'
        );
        setChannels([]);
      });
    getOmeZarrMetadata(dataUrl)
      .then(setMetadata)
      // Metadata is a nice-to-have here; ignore fetch failures.
      .catch(() => setMetadata(null));
  }, [isOpen, fsp_name, path]);
  const loading = channels === undefined || metadata === undefined;

  // A plain (non-OME) Zarr array has no multiscale axes and no channels, so its
  // expanded body would otherwise be empty. Track whether there is anything to
  // show so we can render an explicit "nothing here" message instead.
  const hasOmeContent =
    !!metadata?.multiscales?.[0]?.axes?.length || (channels?.length ?? 0) > 0;

  return (
    <div className="border-b border-surface py-2">
      <div className="flex items-center justify-between gap-2">
        <button
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          onClick={() => setIsOpen(!isOpen)}
          type="button"
        >
          <FgIcon
            className={isOpen ? 'rotate-90' : ''}
            icon={HiChevronRight}
            size="sm"
          />
          <Typography className="text-foreground truncate">{label}</Typography>
          {kind !== 'loading' ? (
            <FgTooltip label={LAYER_STATUS[kind].label[tense]}>
              <FgIcon
                className="shrink-0"
                color={LAYER_STATUS[kind].color}
                icon={LAYER_STATUS[kind].icon}
                label={LAYER_STATUS[kind].label[tense]}
                size="sm"
              />
            </FgTooltip>
          ) : null}
          {mismatch ? (
            <FgTooltip label="Dimensions differ from the first layer in this view">
              <FgIcon
                className="text-warning shrink-0"
                icon={HiExclamationTriangle}
                size="sm"
              />
            </FgTooltip>
          ) : null}
        </button>
        <IconButton
          aria-label="Remove dataset"
          onClick={onRemove}
          variant="ghost"
        >
          <FgIcon color="error" icon={HiOutlineTrash} size="sm" />
        </IconButton>
      </div>
      <Link
        className="block pl-6 text-primary text-xs truncate hover:underline"
        to={makeBrowseLink(fsp_name, path)}
      >
        {displayPath}
      </Link>

      <Collapse open={isOpen}>
        <div className="pl-6 flex flex-col gap-2 pt-2">
          {loading ? (
            <Typography className="text-foreground/70 text-sm">
              Loading...
            </Typography>
          ) : !hasOmeContent ? (
            <Typography className="text-foreground/70 text-sm">
              No OME-Zarr metadata to display.
            </Typography>
          ) : (
            <>
              {metadata ? <ZarrAxisTable metadata={metadata} /> : null}
              {renderChannels?.(channels ?? [])}
            </>
          )}
        </div>
      </Collapse>
    </div>
  );
}
