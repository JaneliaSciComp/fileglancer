import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { View } from '@/queries/viewQueries';

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
    cart: [{ fsp_name: 'fsp', path: '/a', label: 'a' }],
    cartCount: 1,
    addToCart: vi.fn(),
    removeFromCart: vi.fn(),
    clearCart: vi.fn()
  })
}));
vi.mock('@/hooks/useDefaultNeuroglancerBaseUrl', () => ({
  useDefaultNeuroglancerBaseUrl: () => 'https://ng.example/'
}));

import NGViews from '@/components/NGViews';

function renderNGViews() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NGViews />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('NGViews page', () => {
  it('shows Saved Views and Layer Cart tabs, with the seeded view listed', () => {
    renderNGViews();
    expect(
      screen.getByRole('button', { name: /saved views/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /layer cart/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Seeded View')).toBeInTheDocument();
  });

  it('switches to the Layer Cart tab and shows the cart item', async () => {
    const user = userEvent.setup();
    renderNGViews();
    await user.click(screen.getByRole('button', { name: /layer cart/i }));
    expect(screen.getByText('a')).toBeInTheDocument(); // cart item label
  });
});
