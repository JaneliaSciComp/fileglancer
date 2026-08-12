import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CartItem } from '@/contexts/CartContext';
import type { View } from '@/queries/viewQueries';

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
vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@/contexts/CartContext', () => ({
  useCartContext: () => ({
    cart,
    clearCart: vi.fn().mockResolvedValue(undefined)
  })
}));
vi.mock('@/queries/proxiedPathQueries', () => ({
  useAllProxiedPathsQuery: () => ({ data: [] })
}));
vi.mock('@/components/ui/Views/CartDatasetRow', () => ({
  default: ({ label }: { label: string }) => (
    <div data-testid="row">{label}</div>
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

import CartList from '@/components/ui/Views/CartList';

beforeEach(() => {
  navigate.mockClear();
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

  it('navigates to the embedded viewer when a View is created', async () => {
    cart = [cartA, cartB];
    const user = userEvent.setup();
    render(<CartList />);

    await user.click(screen.getByRole('button', { name: /create view/i }));

    expect(navigate).toHaveBeenCalledWith('/view/rk1');
  });
});
