import {
  getOmeZarrMetadata,
  generateNeuroglancerStateForOmeZarr,
  generateNeuroglancerStateForDataURL,
  generateStateForPlainZarr
} from '@/omezarr-helper';
import type { Metadata } from '@/omezarr-helper';
import type { ViewLayer, ViewLayerInput } from '@/queries/viewQueries';
import { default as log } from '@/logger';

export type DatasetKind = 'ome' | 'array' | 'unsupported';

// A dataset that produced no Neuroglancer layer is still recorded as a
// ViewLayer (so the Views table can list it as a source), flagged via opts.
export const UNSUPPORTED_LAYER_OPTS = { unsupported: true } as const;
export function isUnsupportedLayer(layer: Pick<ViewLayer, 'opts'>): boolean {
  return layer.opts?.unsupported === true;
}
export type DatasetProbe =
  | { kind: 'ome'; metadata: Metadata }
  | { kind: 'array'; state: string }
  | { kind: 'unsupported'; errors: unknown[] };

// Single source of truth for "what will this dataset become in Neuroglancer":
// the cart indicator and checkout both call this, so they cannot disagree.
export async function probeDataset(url: string): Promise<DatasetProbe> {
  try {
    return { kind: 'ome', metadata: await getOmeZarrMetadata(url) };
  } catch (omeError) {
    try {
      const state = await generateStateForPlainZarr(url);
      return { kind: 'array', state };
    } catch (plainError) {
      return { kind: 'unsupported', errors: [omeError, plainError] };
    }
  }
}

export type ResolvedCheckoutDataset = {
  url: string;
  sharing_key: string;
  fsp_name: string;
  path: string;
  channel?: string;
  channelIndex?: number;
  label: string;
};

export type NgLayer = Record<string, unknown> & { name?: string };
export type NgState = Record<string, unknown> & { layers?: NgLayer[] };

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
  const probe = await probeDataset(ds.url);
  if (probe.kind === 'unsupported') {
    log.error(
      `Failed to generate Neuroglancer state for ${ds.url}`,
      ...probe.errors
    );
    return null;
  }
  try {
    if (probe.kind === 'array') {
      return decodeState(probe.state);
    }
    const { metadata } = probe;
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
  const unsupported: ResolvedCheckoutDataset[] = [];
  let base: NgState | null = null;

  for (const ds of datasets) {
    const state = await generateStateForDataset(ds);
    if (!state) {
      unsupported.push(ds);
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

  // Unsupported datasets get indices past the real layers: unique, and they
  // never point into ng_state.layers.
  for (const ds of unsupported) {
    viewLayers.push({
      sharing_key: ds.sharing_key,
      layer_index: viewLayers.length,
      channel: ds.channel ?? null,
      opts: { ...UNSUPPORTED_LAYER_OPTS }
    });
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

// NG requires unique layer names: `name`, else `name (2)`, `name (3)`, …
// NG splits a multichannel OME-Zarr layer `name` into `name <channel>`
// layers, so a name is also taken when one of its split layers exists.
// ponytail: a different dataset named `name <something>` also counts as
// taken; that only costs an unneeded ` (2)`.
function uniqueName(name: string, taken: Set<string>): string {
  const isTaken = (n: string) =>
    [...taken].some(t => t === n || t.startsWith(`${n} `));
  if (!isTaken(name)) {
    return name;
  }
  let n = 2;
  while (isTaken(`${name} (${n})`)) {
    n++;
  }
  return `${name} (${n})`;
}

// Adds layers to an existing View's state. The View keeps its dimensions,
// layout and selected layer. Added layers from index 4 on start archived,
// the same rule as checkout.
export function appendLayers(current: NgState, added: NgLayer[]): NgState {
  const layers = [...(current.layers ?? [])];
  const taken = new Set(
    layers.map(l => l.name).filter((n): n is string => typeof n === 'string')
  );
  for (const layer of added) {
    const name = uniqueName(layer.name ?? 'layer', taken);
    taken.add(name);
    layers.push({ ...layer, name, archived: layers.length >= 4 });
  }
  return { ...current, layers };
}
