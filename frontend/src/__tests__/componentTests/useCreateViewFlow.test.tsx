import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

const checkout = vi.fn();
const clearCart = vi.fn();
let automatic = true;
vi.mock('@/hooks/useCartCheckout', () => ({
  useCartCheckout: () => ({ checkout })
}));
vi.mock('@/contexts/CartContext', () => ({
  useCartContext: () => ({ clearCart })
}));
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({
    areDataLinksAutomatic: automatic,
    dataLinkSubpathMode: 'full_path',
    toggleAutomaticDataLinks: vi.fn()
  })
}));
vi.mock('@/queries/proxiedPathQueries', () => ({
  useAllProxiedPathsQuery: () => ({ data: [] })
}));
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));

import { useCreateViewFlow } from '@/hooks/useCreateViewFlow';

const datasets = [{ fsp_name: 'f', path: '/a', label: 'A' }];

type FlowApi = ReturnType<typeof useCreateViewFlow>;

// Renders the hook for real (rather than via renderHook) so its returned
// `dialog` node stays reactive across state updates, the same way
// CreateViewButton consumes it.
function Harness({ apiRef }: { apiRef: { current: FlowApi | null } }) {
  const api = useCreateViewFlow();
  apiRef.current = api;
  return <>{api.dialog}</>;
}

beforeEach(() => {
  checkout
    .mockReset()
    .mockResolvedValue({ short_key: 'v1', read_key: 'rk1', name: 'A' });
  clearCart.mockReset().mockResolvedValue(undefined);
  automatic = true;
});

describe('useCreateViewFlow', () => {
  it('never checks out immediately when links are automatic; opens a dialog with the prefilled name instead', async () => {
    const onCreated = vi.fn();
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);

    act(() => {
      apiRef.current!.startCreateView(datasets, 'A', onCreated);
    });

    expect(checkout).not.toHaveBeenCalled();
    expect(apiRef.current!.open).toBe(true);

    const input = await screen.findByRole('textbox', { name: /view name/i });
    expect(input).toHaveValue('A');
    expect(
      screen.queryByText(/are you sure you want to create a data link/i)
    ).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(checkout).toHaveBeenCalledWith(datasets, 'A');
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ read_key: 'rk1' })
    );
    expect(clearCart).toHaveBeenCalled();
  });

  it('opens the dialog with data-link consent copy when links are not automatic, and waits for Continue', async () => {
    automatic = false;
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);

    act(() => {
      apiRef.current!.startCreateView(datasets, 'A');
    });

    expect(checkout).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/are you sure you want to create a data link/i)
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(checkout).toHaveBeenCalledWith(datasets, 'A');
    expect(clearCart).toHaveBeenCalled();
  });

  it('does not clear the cart when checkout fails', async () => {
    checkout.mockReset().mockRejectedValue(new Error('checkout failed'));
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);

    act(() => {
      apiRef.current!.startCreateView(datasets, 'A');
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(checkout).toHaveBeenCalledWith(datasets, 'A');
    expect(clearCart).not.toHaveBeenCalled();
  });

  it('still completes onCreated/navigate/dialog-close when checkout succeeds but clearCart rejects, without a "Checkout failed" toast', async () => {
    clearCart.mockReset().mockRejectedValue(new Error('cart clear failed'));
    const onCreated = vi.fn();
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);

    act(() => {
      apiRef.current!.startCreateView(datasets, 'A', onCreated);
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    // The View was created successfully, so the success path must complete
    // regardless of the cart-clear failure.
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ read_key: 'rk1' })
    );
    expect(apiRef.current!.open).toBe(false);
    expect(toast.error).not.toHaveBeenCalledWith('Checkout failed');

    await waitFor(() => expect(clearCart).toHaveBeenCalled());
  });
});
