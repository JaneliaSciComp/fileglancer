import { useEffect, useMemo, useState } from 'react';

import {
  dataLinkSegment,
  isUnsupportedLayer,
  layerUsesSegment
} from '@/utils/viewCheckout';
import { datasetKey } from '@/utils/pathHandling';
import type { NeuroglancerBridge } from '@/hooks/useNeuroglancerViewer';
import type { ViewLayer } from '@/queries/viewQueries';
import type { NgLayer, ResolvedCheckoutDataset } from '@/utils/viewCheckout';

/** A dataset whose Data Link may appear in the viewer's layer sources. */
export type KnownDataset = {
  fsp_name: string;
  path: string;
  sharing_key: string;
  url_prefix: string;
};

/** One row of the Sources tab: a dataset in the viewer, or a stray layer. */
export type LiveSource = {
  key: string;
  /** Null for a layer added in Neuroglancer from outside Fileglancer. */
  fsp_name: string | null;
  path: string | null;
  label: string;
  /** The Neuroglancer layers showing this dataset; none if unsupported. */
  layerNames: string[];
  /** Those of layerNames that are archived: kept in the state, not shown. */
  archivedNames: string[];
  /** Per layerNames entry: its channel index, or null if not one channel. */
  layerChannels: (number | null)[];
  sharing_key: string | null;
  /** Recorded as a source only: it can't load as a Neuroglancer layer. */
  unsupported: boolean;
};

// A per-channel layer pins its one local dimension, the channel axis.
function channelOf(layer: NgLayer): number | null {
  const pos = layer.localPosition;
  return Array.isArray(pos) && pos.length === 1 && typeof pos[0] === 'number'
    ? pos[0]
    : null;
}

const basename = (path: string) =>
  path.replace(/\/+$/, '').split('/').pop() || path;

/**
 * Groups the viewer's layers into datasets by the Data Link segment in their
 * sources (as the server's reconcile_view_layers does), in first-layer order,
 * then appends the unsupported datasets, which have no layer.
 */
export function groupLayersBySource(
  layers: NgLayer[],
  known: KnownDataset[],
  unsupported: KnownDataset[]
): LiveSource[] {
  const segments = known.map(ds => ({
    ds,
    segment: dataLinkSegment(ds.sharing_key, ds.url_prefix)
  }));
  const rows = new Map<string, LiveSource>();
  layers.forEach((layer, i) => {
    const name = typeof layer.name === 'string' ? layer.name : `layer ${i}`;
    const ds = segments.find(s => layerUsesSegment(layer, s.segment))?.ds;
    if (!ds) {
      rows.set(`layer:${name}`, {
        key: `layer:${name}`,
        fsp_name: null,
        path: null,
        label: name,
        layerNames: [name],
        archivedNames: layer.archived ? [name] : [],
        layerChannels: [channelOf(layer)],
        sharing_key: null,
        unsupported: false
      });
      return;
    }
    const key = datasetKey(ds.fsp_name, ds.path);
    const row = rows.get(key);
    if (row) {
      row.layerNames.push(name);
      row.layerChannels.push(channelOf(layer));
      if (layer.archived) {
        row.archivedNames.push(name);
      }
    } else {
      rows.set(key, {
        key,
        fsp_name: ds.fsp_name,
        path: ds.path,
        label: basename(ds.path),
        layerNames: [name],
        archivedNames: layer.archived ? [name] : [],
        layerChannels: [channelOf(layer)],
        sharing_key: ds.sharing_key,
        unsupported: false
      });
    }
  });
  for (const ds of unsupported) {
    const key = datasetKey(ds.fsp_name, ds.path);
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        fsp_name: ds.fsp_name,
        path: ds.path,
        label: basename(ds.path),
        layerNames: [],
        archivedNames: [],
        layerChannels: [],
        sharing_key: ds.sharing_key,
        unsupported: true
      });
    }
  }
  return [...rows.values()];
}

/** A checkbox in a Sources row; no layerName if not in the View yet. */
export type ChannelRow = { key: string; label: string; layerName?: string };

// When every layer of the dataset is one channel, list all of its channels,
// so channels never added to the View can be added here. Otherwise list the
// layers NG split the dataset into.
export function channelRows(
  source: LiveSource,
  channels: string[]
): ChannelRow[] | null {
  const perChannel =
    channels.length > 0 &&
    source.layerChannels.length > 0 &&
    source.layerChannels.every(c => c !== null);
  if (perChannel) {
    return channels.map((label, index) => {
      const i = source.layerChannels.indexOf(index);
      return {
        key: `channel:${index}`,
        label,
        layerName: i >= 0 ? source.layerNames[i] : undefined
      };
    });
  }
  if (source.layerNames.length > 1) {
    return source.layerNames.map(name => ({
      key: name,
      label: name,
      layerName: name
    }));
  }
  return null;
}

// NG fires `changed` on every camera frame.
const THROTTLE_MS = 300;

/**
 * The datasets in the viewer right now, kept in sync with Neuroglancer's own
 * state: removing a layer in Neuroglancer drops it here too. Layers map to
 * datasets through the View's saved rows plus the datasets added this
 * session (not saved yet, so not in the rows).
 */
export function useViewSources(
  bridge: NeuroglancerBridge,
  {
    viewLayers,
    added,
    pendingSources,
    removedSources
  }: {
    readonly viewLayers: ViewLayer[];
    readonly added: ResolvedCheckoutDataset[];
    /** Data Links of added, unsupported datasets, recorded on Save. */
    readonly pendingSources: string[];
    /** Data Links of saved, unsupported sources removed until Save. */
    readonly removedSources: string[];
  }
): LiveSource[] {
  const { status, getState, subscribe } = bridge;
  const [layers, setLayers] = useState<NgLayer[]>([]);

  useEffect(() => {
    if (status !== 'ready') {
      return;
    }
    let shown = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      timer = undefined;
      const next = (getState().layers ?? []) as NgLayer[];
      // Only names, sources and archiving decide the rows; skip camera-only
      // changes.
      const key = JSON.stringify(
        next.map(l => [l.name, l.source, !!l.archived])
      );
      if (key !== shown) {
        shown = key;
        setLayers(next);
      }
    };
    read();
    const off = subscribe(() => {
      timer ??= setTimeout(read, THROTTLE_MS);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [status, getState, subscribe]);

  const { known, unsupported } = useMemo(() => {
    const saved: KnownDataset[] = [];
    const unsupported: KnownDataset[] = [];
    for (const l of viewLayers) {
      if (
        l.fsp_name === null ||
        l.path === null ||
        l.sharing_key === null ||
        l.url_prefix === null
      ) {
        continue;
      }
      const ds = {
        fsp_name: l.fsp_name,
        path: l.path,
        sharing_key: l.sharing_key,
        url_prefix: l.url_prefix
      };
      if (!isUnsupportedLayer(l)) {
        saved.push(ds);
      } else if (!removedSources.includes(l.sharing_key)) {
        unsupported.push(ds);
      }
    }
    // ponytail: added datasets are never forgotten this session; once their
    // layers are gone (Discard) they simply match nothing.
    const pending = added.filter(ds => pendingSources.includes(ds.sharing_key));
    return {
      known: [...saved, ...added],
      unsupported: [...unsupported, ...pending]
    };
  }, [viewLayers, added, pendingSources, removedSources]);

  return useMemo(
    () => groupLayersBySource(layers, known, unsupported),
    [layers, known, unsupported]
  );
}
