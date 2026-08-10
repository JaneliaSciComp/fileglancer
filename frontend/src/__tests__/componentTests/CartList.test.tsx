import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CartItem } from '@/contexts/CartContext';

const cartA: CartItem = { fsp_name: 'f', path: '/a', label: 'Dataset A' };
const cartB: CartItem = { fsp_name: 'f', path: '/b', label: 'Dataset B' };

let cart: CartItem[] = [];
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
  default: ({ label }: { label?: string }) => (
    <button type="button">{label ?? 'Create View'}</button>
  )
}));

import CartList from '@/components/ui/Views/CartList';

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
});
