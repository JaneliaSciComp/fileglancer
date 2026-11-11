import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

const clearChecked = vi.fn();
const addToCart = vi.fn().mockResolvedValue(undefined);
const openDrawer = vi.hoisted(() => vi.fn());

vi.mock('react-router', () => ({ useOutletContext: () => ({ openDrawer }) }));

const twoCheckedFiles = [
  { name: 'a.txt', path: '/dir/a.txt' },
  { name: 'b.txt', path: '/dir/b.txt' }
];
let checkedFiles: typeof twoCheckedFiles = twoCheckedFiles;

vi.mock('@/contexts/FileBrowserContext', () => ({
  useFileBrowserContext: () => ({
    fileBrowserState: { checkedFiles },
    clearChecked,
    fileQuery: { data: { currentFileSharePath: { name: 'myFsp' } } }
  })
}));

vi.mock('@/contexts/CartContext', () => ({
  useCartContext: () => ({ addToCart })
}));

import SelectionBar from '@/components/ui/BrowsePage/SelectionBar';

beforeEach(() => {
  clearChecked.mockClear();
  addToCart.mockClear();
  openDrawer.mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  checkedFiles = twoCheckedFiles;
});

describe('SelectionBar', () => {
  it('shows the count and adds mapped items to cart', async () => {
    const user = userEvent.setup();
    render(<SelectionBar />);

    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add 2 to cart/i }));
    expect(addToCart).toHaveBeenCalledWith([
      { fsp_name: 'myFsp', path: '/dir/a.txt', label: 'a.txt' },
      { fsp_name: 'myFsp', path: '/dir/b.txt', label: 'b.txt' }
    ]);
    expect(toast.success).toHaveBeenCalled();
  });

  it('reports an error toast when addToCart rejects', async () => {
    addToCart.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<SelectionBar />);

    await user.click(screen.getByRole('button', { name: /add 2 to cart/i }));
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not offer a create-view shortcut; the cart is the only path', () => {
    render(<SelectionBar />);
    expect(screen.queryByText(/New View/)).not.toBeInTheDocument();
    expect(screen.getByText('Add 2 to cart')).toBeInTheDocument();
  });

  it('clears the selection when Clear is clicked', async () => {
    const user = userEvent.setup();
    render(<SelectionBar />);
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(clearChecked).toHaveBeenCalled();
  });

  it('opens the cart drawer after adding the selection', async () => {
    render(<SelectionBar />);
    await userEvent.click(screen.getByText('Add 2 to cart'));
    expect(addToCart).toHaveBeenCalled();
    expect(openDrawer).toHaveBeenCalledWith('cart');
  });

  it('does not open the drawer when adding fails', async () => {
    addToCart.mockRejectedValueOnce(new Error('nope'));
    render(<SelectionBar />);
    await userEvent.click(screen.getByText('Add 2 to cart'));
    expect(openDrawer).not.toHaveBeenCalled();
  });
});

describe('SelectionBar when nothing is checked', () => {
  it('renders nothing', () => {
    checkedFiles = [];
    const { container } = render(<SelectionBar />);
    expect(container).toBeEmptyDOMElement();
  });
});
