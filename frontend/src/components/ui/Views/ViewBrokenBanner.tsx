import { Typography } from '@material-tailwind/react';

import FgButton from '@/components/designSystem/atoms/FgButton';
import FgTooltip from '@/components/ui/widgets/FgTooltip';
import { usePreferencesContext } from '@/contexts/PreferencesContext';
import { useZoneAndFspMapContext } from '@/contexts/ZonesAndFspMapContext';
import { isRelinkableLayer } from '@/queries/viewQueries';
import type { ViewLayer } from '@/queries/viewQueries';
import type { RelinkTarget } from '@/components/ui/Dialogs/RelinkDialog';
import type { FileSharePath } from '@/shared.types';
import { getPreferredPathForDisplay, makeMapKey } from '@/utils';
import { datasetKey } from '@/utils/pathHandling';

type ViewBrokenBannerProps = {
  readonly layers: ViewLayer[];
  readonly disabled: boolean;
  readonly onRelink: (target: RelinkTarget) => void;
};

/** Owner-only: lists the View's relinkable broken sources, one per dataset. */
export default function ViewBrokenBanner({
  layers,
  disabled,
  onRelink
}: ViewBrokenBannerProps) {
  const { pathPreference } = usePreferencesContext();
  const { zonesAndFspQuery } = useZoneAndFspMapContext();

  // Per-channel layers of one dataset share a source.
  const sources = new Map<string, RelinkTarget>();
  for (const layer of layers) {
    if (
      !isRelinkableLayer(layer) ||
      layer.fsp_name === null ||
      layer.path === null
    ) {
      continue;
    }
    const key = datasetKey(layer.fsp_name, layer.path);
    if (sources.has(key)) {
      continue;
    }
    const fsp = zonesAndFspQuery.data?.[makeMapKey('fsp', layer.fsp_name)] as
      | FileSharePath
      | undefined;
    sources.set(key, {
      fsp_name: layer.fsp_name,
      path: layer.path,
      displayPath:
        getPreferredPathForDisplay(pathPreference, fsp, layer.path) ||
        layer.path
    });
  }
  if (sources.size === 0) {
    return null;
  }

  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-error bg-error/10 px-4 py-1">
      <Typography className="text-foreground" variant="small">
        {sources.size === 1
          ? '1 source is broken'
          : `${sources.size} sources are broken`}
      </Typography>
      {[...sources.entries()].map(([key, src]) => (
        <div className="flex min-w-0 items-center gap-2" key={key}>
          <Typography
            className="truncate font-mono text-foreground"
            variant="small"
          >
            {src.displayPath}
          </Typography>
          <FgTooltip
            label={
              disabled
                ? 'Save or discard changes first'
                : 'Data link deleted — click to relink'
            }
          >
            <FgButton
              aria-label={`Relink ${src.displayPath}`}
              disabled={disabled}
              onClick={() => onRelink(src)}
              size="sm"
              variant="outline"
            >
              Relink
            </FgButton>
          </FgTooltip>
        </div>
      ))}
    </div>
  );
}
