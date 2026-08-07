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

// Dataset A has an existing Data Link (channel expansion enabled) and TWO
// cart entries (a base entry + an already-checked "GFP" channel entry), to
// exercise the multi-entry "Remove" batch path.
// Dataset B has no Data Link (channel expansion disabled + hint).
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
  getOmeZarrChannels
} = vi.hoisted(() => ({
  addToCart: vi.fn().mockResolvedValue(undefined),
  removeFromCart: vi.fn().mockResolvedValue(undefined),
  removeManyFromCart: vi.fn().mockResolvedValue(undefined),
  clearCart: vi.fn().mockResolvedValue(undefined),
  getOmeZarrChannels: vi.fn().mockResolvedValue(['DAPI', 'GFP'])
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
  getOmeZarrChannels
}));
vi.mock('@/queries/proxiedPathQueries', () => ({
  useAllProxiedPathsQuery: () => ({
    data: [
      {
        fsp_name: 'fsp1',
        path: '/a',
        url: 'https://data.example/a',
        sharing_key: 'k1'
      }
    ],
    error: null,
    isPending: false
  })
}));
vi.mock('@/components/ui/Views/CreateViewButton', () => ({
  default: ({ label }: { label?: string }) => (
    <button type="button">{label ?? 'Create View'}</button>
  )
}));

import NGViews from '@/components/NGViews';

beforeEach(() => {
  addToCart.mockClear();
  removeFromCart.mockClear();
  removeManyFromCart.mockClear();
  clearCart.mockClear();
  getOmeZarrChannels.mockClear();
});

async function renderCartTab() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <NGViews />
    </MemoryRouter>
  );
  await user.click(screen.getByRole('button', { name: /layer cart/i }));
  return user;
}

describe('Layer Cart tab', () => {
  it('lists both cart datasets grouped by (fsp_name, path)', async () => {
    await renderCartTab();
    expect(screen.getByText('Dataset A')).toBeInTheDocument();
    expect(screen.getByText('Dataset B')).toBeInTheDocument();
  });

  it('lazy-loads and shows channels when expanding a dataset with a Data Link', async () => {
    const user = await renderCartTab();
    await user.click(screen.getByRole('button', { name: 'Dataset A' }));

    await waitFor(() => {
      expect(getOmeZarrChannels).toHaveBeenCalledWith('https://data.example/a');
    });
    expect(await screen.findByText('DAPI')).toBeInTheDocument();
    expect(screen.getByText('GFP')).toBeInTheDocument();
  });

  it('disables expansion and shows a hint for a dataset with no Data Link', async () => {
    await renderCartTab();
    const expandButton = screen.getByRole('button', { name: 'Dataset B' });
    expect(expandButton).toBeDisabled();
    expect(
      screen.getByText(/channels load after the view is created/i)
    ).toBeInTheDocument();
    expect(getOmeZarrChannels).not.toHaveBeenCalled();
  });

  it('toggling a channel checkbox adds a channel-specific CartItem', async () => {
    const user = await renderCartTab();
    await user.click(screen.getByRole('button', { name: 'Dataset A' }));
    const dapiCheckbox = await screen.findByLabelText('DAPI');
    await user.click(dapiCheckbox);

    await waitFor(() => {
      expect(addToCart).toHaveBeenCalledWith([
        { fsp_name: 'fsp1', path: '/a', channel: 'DAPI', label: 'DAPI' }
      ]);
    });
  });

  it('removing a multi-entry dataset clears every entry in one batch call, not a loop', async () => {
    const user = await renderCartTab();
    const removeButtons = screen.getAllByRole('button', { name: /^remove$/i });
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
