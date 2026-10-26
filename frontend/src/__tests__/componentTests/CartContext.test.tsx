import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';

const mutateAsync = vi.fn().mockResolvedValue(undefined);
let cartData: unknown[] = [];

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({
    preferenceQuery: { data: { neuroglancerCart: cartData } }
  })
}));
vi.mock('@/queries/preferencesQueries', () => ({
  useUpdatePreferenceMutation: () => ({ mutateAsync })
}));

import { CartProvider, useCartContext } from '@/contexts/CartContext';

function Probe() {
  const {
    cart,
    cartCount,
    addToCart,
    removeFromCart,
    removeManyFromCart,
    clearCart
  } = useCartContext();
  return (
    <div>
      <span data-testid="count">{cartCount}</span>
      <span data-testid="len">{cart.length}</span>
      <button
        onClick={() =>
          addToCart([
            { fsp_name: 'fsp', path: '/a', label: 'a' },
            { fsp_name: 'fsp', path: '/a', label: 'a' } // dup, must not double
          ])
        }
      >
        add
      </button>
      <button onClick={() => removeFromCart('/a')}>remove</button>
      <button
        onClick={() =>
          removeManyFromCart([{ path: '/a' }, { path: '/b', channelIndex: 0 }])
        }
      >
        removeMany
      </button>
      <button
        onClick={() =>
          addToCart([
            {
              fsp_name: 'fsp',
              path: '/r',
              channel: 'Gpb5',
              channelIndex: 1,
              label: 'Gpb5'
            },
            {
              fsp_name: 'fsp',
              path: '/r',
              channel: 'Gpb5',
              channelIndex: 4,
              label: 'Gpb5'
            }
          ])
        }
      >
        addRepeated
      </button>
      <button onClick={() => removeFromCart('/r', 4)}>removeRepeated</button>
      <button onClick={() => clearCart()}>clear</button>
    </div>
  );
}

describe('CartContext', () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    cartData = [];
  });

  it('reflects the preference and exposes a count', () => {
    cartData = [{ fsp_name: 'fsp', path: '/x', label: 'x' }];
    render(
      <CartProvider>
        <Probe />
      </CartProvider>
    );
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('len').textContent).toBe('1');
  });

  it('addToCart dedupes and persists via the preference mutation', async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <Probe />
      </CartProvider>
    );
    await user.click(screen.getByText('add'));
    expect(mutateAsync).toHaveBeenCalledWith({
      key: 'neuroglancerCart',
      value: [{ fsp_name: 'fsp', path: '/a', label: 'a' }]
    });
  });

  it('removeManyFromCart filters all removals in a single persist call', async () => {
    cartData = [
      { fsp_name: 'fsp', path: '/a', label: 'a' },
      {
        fsp_name: 'fsp',
        path: '/b',
        channel: 'DAPI',
        channelIndex: 0,
        label: 'DAPI'
      },
      { fsp_name: 'fsp', path: '/c', label: 'c' }
    ];
    const user = userEvent.setup();
    render(
      <CartProvider>
        <Probe />
      </CartProvider>
    );
    await user.click(screen.getByText('removeMany'));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      key: 'neuroglancerCart',
      value: [{ fsp_name: 'fsp', path: '/c', label: 'c' }]
    });
  });

  it('keys channels by index, so repeated channel names stay distinct', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CartProvider>
        <Probe />
      </CartProvider>
    );
    await user.click(screen.getByText('addRepeated'));
    expect(mutateAsync.mock.calls[0][0].value).toHaveLength(2);

    cartData = mutateAsync.mock.calls[0][0].value;
    rerender(
      <CartProvider>
        <Probe />
      </CartProvider>
    );
    await user.click(screen.getByText('removeRepeated'));
    expect(mutateAsync.mock.calls[1][0].value).toEqual([
      expect.objectContaining({ channelIndex: 1 })
    ]);
  });

  it('clearCart persists an empty array', async () => {
    const user = userEvent.setup();
    render(
      <CartProvider>
        <Probe />
      </CartProvider>
    );
    await user.click(screen.getByText('clear'));
    expect(mutateAsync).toHaveBeenCalledWith({
      key: 'neuroglancerCart',
      value: []
    });
  });
});
