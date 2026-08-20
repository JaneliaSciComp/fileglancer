import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';

import type { View } from '@/queries/viewQueries';
import type { CartItem } from '@/contexts/CartContext';

const view: View = {
  short_key: 'k1',
  read_key: 'r1',
  name: 'Seeded View',
  ng_state: {},
  sharing_mode: 'read',
  owner: 'me',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
  layers: []
};

// Dataset A has TWO cart entries (a base entry + an already-checked "GFP"
// channel entry), to exercise the multi-entry "Remove" batch path.
// Dataset B is a plain single-entry dataset - both expand identically now
// that metadata is fetched from the internal /api/content URL rather than
// a Data Link.
const cartABase: CartItem = {
  fsp_name: 'fsp1',
  path: '/a',
  label: 'Dataset A'
};
const cartAGfp: CartItem = {
  fsp_name: 'fsp1',
  path: '/a',
  channel: 'GFP',
  label: 'GFP'
};
const cartB: CartItem = { fsp_name: 'fsp2', path: '/b', label: 'Dataset B' };

const {
  addToCart,
  removeFromCart,
  removeManyFromCart,
  clearCart,
  getOmeZarrChannels,
  getOmeZarrMetadata,
  getAxesMap
} = vi.hoisted(() => ({
  addToCart: vi.fn().mockResolvedValue(undefined),
  removeFromCart: vi.fn().mockResolvedValue(undefined),
  removeManyFromCart: vi.fn().mockResolvedValue(undefined),
  clearCart: vi.fn().mockResolvedValue(undefined),
  getOmeZarrChannels: vi.fn().mockResolvedValue(['DAPI', 'GFP']),
  getOmeZarrMetadata: vi.fn().mockResolvedValue({
    arr: { shape: [3, 2048, 2048] },
    multiscales: [{ axes: [{ name: 'c' }, { name: 'y' }, { name: 'x' }] }]
  }),
  // Real implementation (not a stub): CartDatasetRow's dims formatting
  // depends on this actually mapping axis name -> shape index.
  getAxesMap: vi.fn((multiscale: { axes?: { name: string }[] }) => {
    const map: Record<string, { name: string; index: number }> = {};
    (multiscale.axes ?? []).forEach((axis, i) => {
      map[axis.name] = { ...axis, index: i };
    });
    return map;
  })
}));

vi.mock('@/contexts/ViewsContext', () => ({
  useViewsContext: () => ({
    allViewsQuery: { data: [view], error: null, isPending: false },
    createViewMutation: { mutateAsync: vi.fn(), isPending: false },
    updateViewMutation: { mutateAsync: vi.fn(), isPending: false },
    deleteViewMutation: { mutateAsync: vi.fn(), isPending: false }
  })
}));
vi.mock('@/contexts/CartContext', () => ({
  useCartContext: () => ({
    cart: [cartABase, cartAGfp, cartB],
    cartCount: 3,
    addToCart,
    removeFromCart,
    removeManyFromCart,
    clearCart
  })
}));
vi.mock('@/hooks/useDefaultNeuroglancerBaseUrl', () => ({
  useDefaultNeuroglancerBaseUrl: () => 'https://ng.example/'
}));
vi.mock('@/omezarr-helper', () => ({
  getOmeZarrChannels,
  getOmeZarrMetadata,
  getAxesMap,
  getResolvedScales: () => [1, 0.65, 0.65],
  translateUnitToNeuroglancer: (unit?: string) => unit ?? ''
}));
vi.mock('@/components/ui/Views/CreateViewButton', () => ({
  default: ({ label }: { label?: string }) => (
    <button type="button">{label ?? 'Create View'}</button>
  )
}));
vi.mock('@/hooks/useCartDimensionCheck', () => ({
  useCartDimensionCheck: () => ({ mismatchedKeys: new Set(), hasMismatch: false })
}));

import CartList from '@/components/ui/Views/CartList';

beforeEach(() => {
  addToCart.mockClear();
  removeFromCart.mockClear();
  removeManyFromCart.mockClear();
  clearCart.mockClear();
  getOmeZarrChannels.mockClear();
  getOmeZarrMetadata.mockClear();
});

async function renderCartTab() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <CartList />
    </MemoryRouter>
  );
  return user;
}

describe('Layer Cart tab', () => {
  it('lists both cart datasets grouped by (fsp_name, path)', async () => {
    await renderCartTab();
    expect(screen.getByText('Dataset A')).toBeInTheDocument();
    expect(screen.getByText('Dataset B')).toBeInTheDocument();
  });

  it('lazy-loads and shows channels when expanding a dataset', async () => {
    const user = await renderCartTab();
    await user.click(screen.getByRole('button', { name: 'Dataset A' }));

    await waitFor(() => {
      expect(getOmeZarrChannels).toHaveBeenCalledWith(
        expect.stringContaining('/api/content/fsp1/a')
      );
    });
    expect(await screen.findByText('DAPI')).toBeInTheDocument();
    expect(screen.getByText('GFP')).toBeInTheDocument();
  });

  it('lazy-loads and shows the axis table when expanding a dataset', async () => {
    getOmeZarrMetadata.mockResolvedValueOnce({
      shapes: [[3, 2048, 2048]],
      arr: { chunks: [1, 512, 512] },
      multiscales: [
        {
          axes: [{ name: 'c' }, { name: 'y' }, { name: 'x' }],
          datasets: [
            {
              coordinateTransformations: [
                { type: 'scale', scale: [1, 0.65, 0.65] }
              ]
            }
          ]
        }
      ]
    });
    const user = await renderCartTab();
    await user.click(screen.getByRole('button', { name: /Dataset A/ }));

    await waitFor(() => {
      expect(getOmeZarrMetadata).toHaveBeenCalledWith(
        expect.stringContaining('/api/content/fsp1/a')
      );
    });
    expect(await screen.findByText('Chunk Size')).toBeInTheDocument();
  });

  it('shows no dims text (and does not crash) when metadata has no axes', async () => {
    getOmeZarrMetadata.mockResolvedValueOnce({
      arr: { shape: [] },
      multiscales: undefined
    });
    const user = await renderCartTab();
    await user.click(screen.getByRole('button', { name: /Dataset A/ }));

    await waitFor(() => {
      expect(getOmeZarrMetadata).toHaveBeenCalled();
    });
    // Channels still render fine; no dims string is shown for this dataset.
    expect(await screen.findByText('DAPI')).toBeInTheDocument();
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });

  it('expands a dataset that has no Data Link (metadata fetched via /api/content)', async () => {
    const user = await renderCartTab();
    const expandButton = screen.getByRole('button', { name: 'Dataset B' });
    expect(expandButton).not.toBeDisabled();
    await user.click(expandButton);

    await waitFor(() => {
      expect(getOmeZarrChannels).toHaveBeenCalledWith(
        expect.stringContaining('/api/content/fsp2/b')
      );
    });
  });

  it('toggling a channel checkbox adds a channel-specific CartItem', async () => {
    const user = await renderCartTab();
    await user.click(screen.getByRole('button', { name: 'Dataset A' }));
    const dapiCheckbox = await screen.findByLabelText('DAPI');
    await user.click(dapiCheckbox);

    await waitFor(() => {
      expect(addToCart).toHaveBeenCalledWith([
        {
          fsp_name: 'fsp1',
          path: '/a',
          channel: 'DAPI',
          label: 'DAPI',
          channelIndex: 0
        }
      ]);
    });
  });

  it('removing a multi-entry dataset clears every entry in one batch call, not a loop', async () => {
    const user = await renderCartTab();
    const removeButtons = screen.getAllByRole('button', {
      name: /remove dataset/i
    });
    // Dataset A (base + GFP channel entries) is the first row.
    await user.click(removeButtons[0]);

    await waitFor(() => {
      expect(removeManyFromCart).toHaveBeenCalledTimes(1);
    });
    expect(removeManyFromCart).toHaveBeenCalledWith([
      { path: '/a', channel: undefined },
      { path: '/a', channel: 'GFP' }
    ]);
    // The bug being regression-tested: no per-item loop calling single-remove.
    expect(removeFromCart).not.toHaveBeenCalled();
  });

  it('shows the Create View control and a Clear cart button', async () => {
    await renderCartTab();
    expect(
      screen.getByRole('button', { name: /create view/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /clear cart/i })
    ).toBeInTheDocument();
  });
});
