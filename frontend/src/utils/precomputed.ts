import { buildUrl } from '@/utils';

/**
 * Neuroglancer precomputed datasets: a directory with a JSON `info` file at
 * its root, whose `@type` names the kind of data.
 * https://github.com/google/neuroglancer/tree/master/src/datasource/precomputed
 */
export type PrecomputedKind =
  | 'volume'
  | 'annotations'
  | 'mesh'
  | 'skeletons'
  | 'segment properties';

export type PrecomputedLayerType = 'image' | 'segmentation' | 'annotation';

export type PrecomputedInfo = {
  kind: PrecomputedKind;
  /** The Neuroglancer layer type this dataset loads as. */
  layerType: PrecomputedLayerType;
  info: Record<string, unknown>;
};

// Meshes, skeletons and segment properties are parts of a segmentation, and
// load as a segmentation layer when used as a source on their own.
const KIND_BY_TYPE: Record<string, PrecomputedKind> = {
  neuroglancer_multiscale_volume: 'volume',
  neuroglancer_annotations_v1: 'annotations',
  neuroglancer_multilod_draco: 'mesh',
  neuroglancer_legacy_mesh: 'mesh',
  neuroglancer_skeletons: 'skeletons',
  neuroglancer_segment_properties: 'segment properties'
};

const VOLUME_KEYS = ['data_type', 'num_channels', 'scales'];
const ANNOTATION_KEYS = [
  'dimensions',
  'annotation_type',
  'lower_bound',
  'upper_bound',
  'spatial'
];

/**
 * Reads a parsed `info` file. Returns null unless it describes a dataset
 * Neuroglancer accepts: a known `@type` (none means a volume) plus the keys
 * that kind requires, so an unrelated file named `info` is not mistaken for
 * one.
 */
export function parsePrecomputedInfo(json: unknown): PrecomputedInfo | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return null;
  }
  const info = json as Record<string, unknown>;
  const type = info['@type'];
  const kind = type === undefined ? 'volume' : KIND_BY_TYPE[String(type)];
  if (!kind) {
    return null;
  }
  const has = (keys: string[]) => keys.every(k => info[k] !== undefined);
  if (kind === 'volume') {
    const volumeType = info.type;
    if (
      (volumeType !== 'image' && volumeType !== 'segmentation') ||
      !has(VOLUME_KEYS) ||
      !Array.isArray(info.scales) ||
      info.scales.length === 0
    ) {
      return null;
    }
    return { kind, layerType: volumeType, info };
  }
  if (kind === 'annotations') {
    return has(ANNOTATION_KEYS)
      ? { kind, layerType: 'annotation', info }
      : null;
  }
  return { kind, layerType: 'segmentation', info };
}

/** Fetches and reads `<dataUrl>/info`; throws if it isn't a precomputed dataset. */
export async function fetchPrecomputedInfo(
  dataUrl: string
): Promise<PrecomputedInfo> {
  const response = await fetch(buildUrl(dataUrl, 'info'), {
    credentials: 'same-origin',
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(`No info file at ${dataUrl} (${response.status})`);
  }
  const parsed = parsePrecomputedInfo(await response.json());
  if (!parsed) {
    throw new Error(`${dataUrl}/info is not Neuroglancer precomputed metadata`);
  }
  return parsed;
}

/**
 * A single-layer Neuroglancer state for a precomputed dataset. `sourceOnly`
 * leaves the layer type for Neuroglancer to pick, as when a URL is pasted
 * into its source input.
 */
export function precomputedState(
  dataUrl: string,
  precomputed: PrecomputedInfo,
  sourceOnly = false
): { layers: Record<string, unknown>[] } & Record<string, unknown> {
  const url = dataUrl.replace(/\/+$/, '');
  const name = url.split('/').filter(Boolean).pop() || 'Default';
  return {
    layers: [
      {
        name,
        source: `precomputed://${url}`,
        type: sourceOnly ? 'new' : precomputed.layerType
      }
    ],
    selectedLayer: { visible: true, layer: name },
    layout: '4panel-alt'
  };
}

const list = (value: unknown): string =>
  Array.isArray(value) ? value.join(', ') : String(value ?? '');

const ids = (value: unknown): string =>
  Array.isArray(value)
    ? value.map(v => (v as { id?: unknown })?.id).join(', ')
    : '';

/** Label/value rows describing the dataset, for the metadata tables. */
export function precomputedSummary({
  kind,
  layerType,
  info
}: PrecomputedInfo): [label: string, value: string][] {
  const rows: [string, string][] = [
    ['Type', kind === 'volume' ? `volume (${layerType})` : kind]
  ];
  const add = (label: string, value: string) => {
    if (value) {
      rows.push([label, value]);
    }
  };
  if (kind === 'volume') {
    const scales = info.scales as Record<string, unknown>[];
    const first = scales[0] ?? {};
    add('Data Type', list(info.data_type));
    add('Channels', list(info.num_channels));
    add('Size', list(first.size));
    add('Resolution (nm)', list(first.resolution));
    add('Encoding', list(first.encoding));
    add('Multiscale Levels', String(scales.length));
  } else if (kind === 'annotations') {
    add('Annotation Type', list(info.annotation_type));
    add(
      'Dimensions',
      Object.entries(info.dimensions as Record<string, unknown>)
        .map(([axis, scale]) => `${axis}: ${list(scale).replace(', ', ' ')}`)
        .join(', ')
    );
    add('Lower Bound', list(info.lower_bound));
    add('Upper Bound', list(info.upper_bound));
    add('Properties', ids(info.properties));
    add('Relationships', ids(info.relationships));
  } else if (kind === 'skeletons') {
    add('Vertex Attributes', ids(info.vertex_attributes));
  } else if (kind === 'segment properties') {
    const inline = info.inline as Record<string, unknown> | undefined;
    add('Properties', ids(inline?.properties));
    add('Segments', Array.isArray(inline?.ids) ? `${inline.ids.length}` : '');
  }
  return rows;
}
