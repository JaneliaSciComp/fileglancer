import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import type { View } from '@/queries/viewQueries';

const clearChecked = vi.fn();
const addToCart = vi.fn().mockResolvedValue(undefined);
const clearCart = vi.fn().mockResolvedValue(undefined);
const navigate = vi.hoisted(() => vi.fn());
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

vi.mock('react-router', () => ({ useNavigate: () => navigate }));

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
  useCartContext: () => ({ addToCart, clearCart })
}));

vi.mock('@/components/ui/Views/CreateViewButton', () => ({
  default: ({ onCreated }: { onCreated?: (view: View) => void }) => (
    <button onClick={() => onCreated?.(createdView)} type="button">
      New View from selection
    </button>
  )
}));

import SelectionBar from '@/components/ui/BrowsePage/SelectionBar';

beforeEach(() => {
  clearChecked.mockClear();
  addToCart.mockClear();
  clearCart.mockClear();
  navigate.mockClear();
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

  it('renders the create-View action wired to the selection', () => {
    render(<SelectionBar />);
    expect(
      screen.getByRole('button', { name: /new view from selection/i })
    ).toBeInTheDocument();
  });

  it('navigates to the embedded viewer when a View is created, without clearing the cart', async () => {
    const user = userEvent.setup();
    render(<SelectionBar />);

    await user.click(
      screen.getByRole('button', { name: /new view from selection/i })
    );

    expect(navigate).toHaveBeenCalledWith('/view/rk1');
    // Datasets here come from fileBrowserState.checkedFiles, not the cart -
    // a View created from a file-browser selection must never wipe an
    // unrelated Layer Cart.
    expect(clearCart).not.toHaveBeenCalled();
  });

  it('clears the selection when Clear is clicked', async () => {
    const user = userEvent.setup();
    render(<SelectionBar />);
    await user.click(screen.getByRole('button', { name: /clear/i }));
    expect(clearChecked).toHaveBeenCalled();
  });
});

describe('SelectionBar when nothing is checked', () => {
  it('renders nothing', () => {
    checkedFiles = [];
    const { container } = render(<SelectionBar />);
    expect(container).toBeEmptyDOMElement();
  });
});
