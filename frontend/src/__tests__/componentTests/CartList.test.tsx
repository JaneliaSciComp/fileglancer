import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CartItem } from '@/contexts/CartContext';
import type { View } from '@/queries/viewQueries';
import type { DatasetKind } from '@/utils/viewCheckout';
import { datasetKey } from '@/utils/pathHandling';

const cartA: CartItem = { fsp_name: 'f', path: '/a', label: 'Dataset A' };
const cartB: CartItem = { fsp_name: 'f', path: '/b', label: 'Dataset B' };
const createdView: View = vi.hoisted(() => ({
  short_key: 'v1',
  read_key: 'rk1',
  name: 'New View',
  ng_state: {},
  sharing_mode: 'read',
  owner: 'me',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  layers: []
}));

let cart: CartItem[] = [];
const navigate = vi.hoisted(() => vi.fn());
const clearCart = vi.hoisted(() => vi.fn());
vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@/contexts/CartContext', () => ({
  useCartContext: () => ({
    cart,
    clearCart
  })
}));
vi.mock('@/components/ui/Views/CartDatasetRow', () => ({
  default: ({
    label,
    kind
  }: {
    label: string;
    kind: DatasetKind | 'loading';
  }) => (
    <div data-testid="row">
      {label}
      {kind === 'ome' || kind === 'array' ? (
        <span aria-label="Will load as a Neuroglancer layer" role="img" />
      ) : null}
      {kind === 'unsupported' ? (
        <span aria-label="Will not load as a Neuroglancer layer" role="img" />
      ) : null}
    </div>
  )
}));
vi.mock('@/components/ui/Views/CreateViewButton', () => ({
  default: ({
    label,
    onCreated
  }: {
    label?: string;
    onCreated?: (view: View) => void;
  }) => (
    <button onClick={() => onCreated?.(createdView)} type="button">
      {label ?? 'Create View'}
    </button>
  )
}));
const dimensionCheck = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCartDimensionCheck', () => ({
  useCartDimensionCheck: () => dimensionCheck()
}));

import CartList from '@/components/ui/Views/CartList';

function mockDimensionCheck(value: {
  mismatchedKeys: Set<string>;
  hasMismatch: boolean;
  kindByKey: Map<string, DatasetKind | 'loading'>;
}) {
  dimensionCheck.mockReturnValue(value);
}

function renderCart(items: CartItem[]) {
  cart = items;
  return render(<CartList />);
}

beforeEach(() => {
  navigate.mockClear();
  clearCart.mockReset().mockResolvedValue(undefined);
  mockDimensionCheck({
    mismatchedKeys: new Set(),
    hasMismatch: false,
    kindByKey: new Map()
  });
});

describe('CartList', () => {
  it('shows the empty state when the cart is empty', () => {
    cart = [];
    render(<CartList />);
    expect(screen.getByText(/your layer cart is empty/i)).toBeInTheDocument();
  });

  it('renders one row per dataset plus the footer actions', () => {
    cart = [cartA, cartB];
    render(<CartList />);
    expect(screen.getAllByTestId('row')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: /create view/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /clear cart/i })
    ).toBeInTheDocument();
  });

  it('navigates to the embedded viewer and clears the cart when a View is created', async () => {
    cart = [cartA, cartB];
    const user = userEvent.setup();
    render(<CartList />);

    await user.click(screen.getByRole('button', { name: /create view/i }));

    expect(navigate).toHaveBeenCalledWith('/view/rk1');
    // CartList's datasets come from the persisted cart, so it - unlike
    // SelectionBar/FileBrowser - is the one caller that should clear it
    // after a successful checkout.
    await waitFor(() => expect(clearCart).toHaveBeenCalled());
  });

  it('marks datasets that will and will not load as Neuroglancer layers', () => {
    mockDimensionCheck({
      mismatchedKeys: new Set(),
      hasMismatch: false,
      kindByKey: new Map([
        [datasetKey('f', '/ok.zarr'), 'ome'],
        [datasetKey('f', '/plain.zarr'), 'array'],
        [datasetKey('f', '/nope'), 'unsupported']
      ])
    });
    renderCart([
      { fsp_name: 'f', path: '/ok.zarr', label: 'ok' },
      { fsp_name: 'f', path: '/plain.zarr', label: 'plain' },
      { fsp_name: 'f', path: '/nope', label: 'nope' }
    ]);
    expect(
      screen.getAllByLabelText('Will load as a Neuroglancer layer')
    ).toHaveLength(2);
    expect(
      screen.getByLabelText('Will not load as a Neuroglancer layer')
    ).toBeInTheDocument();
  });

  it('shows no layer-status indicator while a dataset is still loading', () => {
    mockDimensionCheck({
      mismatchedKeys: new Set(),
      hasMismatch: false,
      kindByKey: new Map() // no entry for cartA's dataset key: still loading
    });
    renderCart([cartA]);
    expect(
      screen.queryByLabelText('Will load as a Neuroglancer layer')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Will not load as a Neuroglancer layer')
    ).not.toBeInTheDocument();
  });
});
