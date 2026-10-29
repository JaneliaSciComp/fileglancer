import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { makeFakeBridge } from '@/__tests__/mocks/fakeNeuroglancer';
import type { ViewEditState } from '@/hooks/useViewEditState';
import type { ViewLayer } from '@/queries/viewQueries';

vi.mock('@/components/ui/Views/SidebarFileBrowser', () => ({
  default: () => null
}));
vi.mock('@/hooks/useAddToView', () => ({ useAddToView: () => vi.fn() }));
vi.mock('@/queries/zoneAndFileSharePathMapQuery', () => ({
  default: () => ({ data: {} })
}));
vi.mock('@/hooks/useCartDimensionCheck', () => ({
  useCartDimensionCheck: () => ({
    mismatchedKeys: new Set(),
    hasMismatch: false,
    kindByKey: new Map()
  })
}));
// The real row fetches metadata through app contexts.
vi.mock('@/components/ui/Views/DatasetRow', () => ({
  default: ({
    label,
    onRemove,
    renderChannels
  }: {
    label: string;
    onRemove: () => void;
    renderChannels?: (channels: string[]) => ReactNode;
  }) => (
    <>
      <button onClick={onRemove} type="button">
        Remove {label}
      </button>
      {renderChannels?.([])}
    </>
  )
}));

import ViewerSidebar from '@/components/ui/Views/ViewerSidebar';

const layer = (name: string, key: string, prefix: string) => ({
  name,
  source: `http://x/files/${key}/${prefix}|zarr2:`
});
const row = (
  key: string,
  path: string,
  extra: Partial<ViewLayer> = {}
): ViewLayer => ({
  layer_index: 0,
  data_link_id: 1,
  channel: null,
  opts: null,
  broken: false,
  fsp_name: 'f',
  path,
  sharing_key: key,
  url_prefix: path.split('/').pop()!,
  ...extra
});

const VIEW_LAYERS = [
  row('K1', 'data/a.zarr'),
  row('K2', 'data/b.zarr'),
  row('K9', 'data/notes', { opts: { unsupported: true } })
];

let editState: ViewEditState;
beforeEach(() => {
  editState = {
    dirty: false,
    pendingSources: [],
    addSources: vi.fn(),
    removedSources: [],
    removeSource: vi.fn(),
    added: [],
    recordAdded: vi.fn(),
    discard: vi.fn(),
    markSaved: vi.fn(),
    markEdited: vi.fn(),
    rebaseline: vi.fn()
  };
});
afterEach(() => vi.useRealTimers());

function setup() {
  const fake = makeFakeBridge({
    layers: [
      layer('a DAPI', 'K1', 'a.zarr'),
      layer('a GFP', 'K1', 'a.zarr'),
      layer('b', 'K2', 'b.zarr')
    ],
    selectedLayer: { layer: 'a GFP', visible: true }
  });
  render(
    <ViewerSidebar
      bridge={fake.bridge}
      editState={editState}
      onClose={vi.fn()}
      onTabChange={vi.fn()}
      tab="sources"
      viewLayers={VIEW_LAYERS}
    />
  );
  return fake;
}

describe('ViewerSidebar Sources tab', () => {
  it('lists the datasets in the viewer', () => {
    setup();
    expect(
      screen
        .getAllByRole('button', { name: /^Remove / })
        .map(b => b.textContent)
    ).toEqual(['Remove a.zarr', 'Remove b.zarr', 'Remove notes']);
  });

  it("removes all of a dataset's layers from Neuroglancer", async () => {
    const fake = setup();
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove a.zarr' })
    );
    expect(fake.bridge.getState()).toEqual({
      layers: [layer('b', 'K2', 'b.zarr')]
    });
    expect(editState.markEdited).toHaveBeenCalled();
  });

  it('removes an unsupported source through the edit state', async () => {
    const fake = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Remove notes' }));
    expect(editState.removeSource).toHaveBeenCalledWith('K9');
    expect(fake.bridge.getState().layers).toHaveLength(3);
  });

  it("archives a channel's layer when unchecked and restores it when checked", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fake = setup();
    const gfp = () => screen.getByRole('checkbox', { name: 'a GFP' });
    expect(gfp()).toBeChecked();
    // A single-layer dataset has no channels to toggle.
    expect(screen.queryByRole('checkbox', { name: 'b' })).toBeNull();

    await userEvent.click(gfp());
    expect(fake.bridge.getState().layers).toEqual([
      layer('a DAPI', 'K1', 'a.zarr'),
      { ...layer('a GFP', 'K1', 'a.zarr'), archived: true },
      layer('b', 'K2', 'b.zarr')
    ]);
    expect(editState.markEdited).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(gfp()).not.toBeChecked();

    await userEvent.click(gfp());
    expect(fake.bridge.getState().layers[1]).toMatchObject({ archived: false });
  });

  it('drops a dataset removed in Neuroglancer', () => {
    vi.useFakeTimers();
    const fake = setup();
    act(() => {
      fake.change({ layers: [layer('b', 'K2', 'b.zarr')] });
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByRole('button', { name: 'Remove a.zarr' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Remove b.zarr' })
    ).toBeInTheDocument();
  });
});
