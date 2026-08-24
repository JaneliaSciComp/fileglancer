import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

const checkout = vi.fn();
let automatic = true;
vi.mock('@/hooks/useCartCheckout', () => ({
  useCartCheckout: () => ({ checkout })
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
vi.mock('@/hooks/useCartDimensionCheck', () => ({
  useCartDimensionCheck: () => ({
    mismatchedKeys: new Set(),
    hasMismatch: false
  })
}));

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
    // Dialog closes on success; the hook does not own cart state, so it has
    // nothing further to do here (see CartList/SelectionBar for cart
    // clearing, which only happens where the cart was actually populated).
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: /view name/i })
      ).not.toBeInTheDocument()
    );
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
  });

  it('keeps the dialog open and shows an error toast when checkout fails', async () => {
    checkout.mockReset().mockRejectedValue(new Error('checkout failed'));
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);

    act(() => {
      apiRef.current!.startCreateView(datasets, 'A');
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^create$/i }));

    expect(checkout).toHaveBeenCalledWith(datasets, 'A');
    expect(toast.error).toHaveBeenCalledWith('checkout failed');
    expect(
      screen.getByRole('textbox', { name: /view name/i })
    ).toBeInTheDocument();
  });
});
