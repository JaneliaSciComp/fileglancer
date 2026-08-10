import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

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
    removeManyFromCart: vi.fn(),
    clearCart: vi.fn()
  })
}));
vi.mock('@/hooks/useDefaultNeuroglancerBaseUrl', () => ({
  useDefaultNeuroglancerBaseUrl: () => 'https://ng.example/'
}));
vi.mock('@/queries/proxiedPathQueries', () => ({
  useAllProxiedPathsQuery: () => ({ data: [], error: null, isPending: false })
}));
vi.mock('@/components/ui/Views/CreateViewButton', () => ({
  default: () => <button type="button">Create View</button>
}));

import NGViews from '@/components/NGViews';

describe('NGViews page', () => {
  it('lists the saved views', () => {
    render(
      <MemoryRouter>
        <NGViews />
      </MemoryRouter>
    );
    expect(screen.getByText('Neuroglancer Views')).toBeInTheDocument();
    expect(screen.getByText('Seeded View')).toBeInTheDocument();
  });
});
