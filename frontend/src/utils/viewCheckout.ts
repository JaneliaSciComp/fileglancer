import {
  getOmeZarrMetadata,
  generateNeuroglancerStateForOmeZarr,
  generateNeuroglancerStateForDataURL
} from '@/omezarr-helper';
import type { ViewLayerInput } from '@/queries/viewQueries';
import { default as log } from '@/logger';

export type ResolvedCheckoutDataset = {
  url: string;
  sharing_key: string;
  fsp_name: string;
  path: string;
  channel?: string;
  channelIndex?: number;
  label: string;
};

type NgLayer = Record<string, unknown> & { name?: string };
type NgState = Record<string, unknown> & { layers?: NgLayer[] };

function decodeState(encoded: string | null): NgState | null {
  if (!encoded) {
    return null;
  }
  try {
    return JSON.parse(decodeURIComponent(encoded)) as NgState;
  } catch (error) {
    log.error('Failed to decode generated Neuroglancer state', error);
    return null;
  }
}

async function generateStateForDataset(
  ds: ResolvedCheckoutDataset
): Promise<NgState | null> {
  try {
    const metadata = await getOmeZarrMetadata(ds.url);
    const multiscale = metadata.multiscales?.[0];
    // ponytail: default layerType 'image' — the thumbnail-edge heuristic used
    // for the single-dir preview needs a rendered thumbnail we don't have here.
    const encoded = multiscale
      ? generateNeuroglancerStateForOmeZarr(
          ds.url,
          metadata.zarrVersion,
          'image',
          multiscale,
          metadata.arr,
          metadata.labels,
          metadata.omero,
          ds.channel !== undefined
        )
      : generateNeuroglancerStateForDataURL(ds.url, metadata.zarrVersion);
    return decodeState(encoded);
  } catch (error) {
    // One broken cart entry (moved/deleted file, missing multiscale) must
    // not abort the whole checkout — skip it, keep the rest.
    log.error(`Failed to generate Neuroglancer state for ${ds.url}`, error);
    return null;
  }
}

// With a channel selection, checkout forces the per-channel layer path, so
// layers are in c-axis index order; pick the selected channel's layer by
// index. No channel → keep every layer the dataset produced.
function selectLayers(state: NgState, channelIndex?: number): NgLayer[] {
  const layers = state.layers ?? [];
  if (channelIndex === undefined) {
    return layers;
  }
  const picked = layers[channelIndex];
  return picked ? [picked] : layers;
}

// ponytail: merge per-dataset generated states instead of refactoring the
// generator to emit objects. Ceiling: cross-dataset coordinate spaces aren't
// reconciled (first dataset's dimensions win) and layer_index>4 is archived
// per NG default — fine for curated read-only carts; revisit if
// mixed-resolution overlays misalign.
export async function buildViewState(
  datasets: ResolvedCheckoutDataset[]
): Promise<{ ng_state: Record<string, unknown>; layers: ViewLayerInput[] }> {
  const combinedLayers: NgLayer[] = [];
  const viewLayers: ViewLayerInput[] = [];
  let base: NgState | null = null;

  for (const ds of datasets) {
    const state = await generateStateForDataset(ds);
    if (!state) {
      continue;
    }
    if (!base) {
      base = state;
    }
    for (const layer of selectLayers(state, ds.channelIndex)) {
      const layer_index = combinedLayers.length;
      combinedLayers.push({ ...layer, archived: layer_index >= 4 });
      viewLayers.push({
        sharing_key: ds.sharing_key,
        layer_index,
        channel: ds.channel ?? null,
        opts: null
      });
    }
  }

  const first = combinedLayers[0];
  const ng_state: Record<string, unknown> = {
    ...(base ?? {}),
    layers: combinedLayers,
    selectedLayer: first ? { visible: true, layer: first.name } : undefined,
    layout: (base?.layout as string) ?? '4panel-alt'
  };
  return { ng_state, layers: viewLayers };
}
