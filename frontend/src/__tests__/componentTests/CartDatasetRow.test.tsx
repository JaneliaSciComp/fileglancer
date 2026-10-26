import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import type { CartItem } from '@/contexts/CartContext';

const addToCart = vi.fn();
const removeManyFromCart = vi.fn();
vi.mock('@/contexts/CartContext', () => ({
  useCartContext: () => ({
    addToCart,
    removeFromCart: vi.fn(),
    removeManyFromCart
  })
}));
vi.mock('@/components/ui/Views/DatasetRow', () => ({
  default: ({
    renderChannels
  }: {
    renderChannels: (channels: string[]) => ReactNode;
  }) => <div>{renderChannels(['DAPI', 'GFP', 'DAPI'])}</div>
}));

import CartDatasetRow from '@/components/ui/Views/CartDatasetRow';

const base: CartItem = { fsp_name: 'f', path: '/a', label: 'A' };

function renderRow(items: CartItem[]) {
  render(
    <CartDatasetRow fsp_name="f" items={items} kind="ome" label="A" path="/a" />
  );
  return screen.getByRole('checkbox', { name: 'All channels' });
}

beforeEach(() => {
  addToCart.mockReset().mockResolvedValue(undefined);
  removeManyFromCart.mockReset().mockResolvedValue(undefined);
});

describe('CartDatasetRow "All channels"', () => {
  it('adds every channel by index, repeated names included', async () => {
    await userEvent.click(renderRow([base]));
    expect(addToCart).toHaveBeenCalledWith([
      {
        fsp_name: 'f',
        path: '/a',
        channel: 'DAPI',
        label: 'DAPI',
        channelIndex: 0
      },
      {
        fsp_name: 'f',
        path: '/a',
        channel: 'GFP',
        label: 'GFP',
        channelIndex: 1
      },
      {
        fsp_name: 'f',
        path: '/a',
        channel: 'DAPI',
        label: 'DAPI',
        channelIndex: 2
      }
    ]);
  });

  it('is indeterminate when only some channels are checked', () => {
    const box = renderRow([
      base,
      { ...base, channel: 'GFP', label: 'GFP', channelIndex: 1 }
    ]) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.indeterminate).toBe(true);
  });

  it('unchecking removes the channel entries but keeps the dataset', async () => {
    const channels = [0, 1, 2].map(i => ({ ...base, channelIndex: i }));
    const box = renderRow([base, ...channels]) as HTMLInputElement;
    expect(box.checked).toBe(true);
    await userEvent.click(box);
    expect(removeManyFromCart).toHaveBeenCalledWith([
      { path: '/a', channelIndex: 0 },
      { path: '/a', channelIndex: 1 },
      { path: '/a', channelIndex: 2 }
    ]);
  });
});
