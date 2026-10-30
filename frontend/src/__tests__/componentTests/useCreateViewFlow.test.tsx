import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

const checkout = vi.fn();
const resolveCartDatasets = vi.fn();
const buildViewState = vi.fn();
const navigate = vi.fn();
let automatic = true;
vi.mock('@/utils/viewCheckout', () => ({
  buildViewState: (...args: unknown[]) => buildViewState(...args)
}));
vi.mock('@/hooks/useCartCheckout', () => ({
  useCartCheckout: () => ({
    checkout,
    resolveCartDatasets,
    isBucketDataset: (ds: { fsp_name: string }) => ds.fsp_name === 'bucket'
  })
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
vi.mock('react-router', () => ({ useNavigate: () => navigate }));
vi.mock('@/hooks/useCartDimensionCheck', () => ({
  useCartDimensionCheck: () => ({
    mismatchedKeys: new Set(),
    hasMismatch: false,
    kindByKey: new Map()
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

// The pre-opened tab the draft is handed to.
let tab: { location: { href: string }; close: ReturnType<typeof vi.fn> };
beforeEach(() => {
  localStorage.clear();
  tab = { location: { href: '' }, close: vi.fn() };
  vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  checkout
    .mockReset()
    .mockResolvedValue({ short_key: 'v1', read_key: 'rk1', name: 'A' });
  automatic = true;
  navigate.mockReset();
  resolveCartDatasets.mockReset().mockResolvedValue([{ url: 'u' }]);
  buildViewState
    .mockReset()
    .mockResolvedValue({ ng_state: { layers: [] }, layers: [] });
});

describe('useCreateViewFlow draft', () => {
  const DRAFT = {
    name: 'A',
    ng_state: { layers: [] },
    layers: [],
    datasets: [{ url: 'u' }]
  };

  it('opens the unsaved draft in a new tab, without a dialog, when links are automatic', async () => {
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);

    act(() => {
      apiRef.current!.startDraftView(datasets, 'A');
    });

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(tab.location.href).not.toBe(''));
    const url = tab.location.href;
    const id = new URL(url, 'http://x').searchParams.get('draft')!;
    expect(url).toBe(`/view/new?draft=${id}`);
    expect(
      JSON.parse(localStorage.getItem(`fg-view-draft:${id}`)!).draft
    ).toEqual(DRAFT);
    expect(navigate).not.toHaveBeenCalled();
    expect(checkout).not.toHaveBeenCalled();
  });

  it('keeps other recent drafts and drops ones older than a day', async () => {
    const day = 24 * 60 * 60 * 1000;
    localStorage.setItem(
      'fg-view-draft:recent',
      JSON.stringify({ draft: DRAFT, storedAt: Date.now() - day / 2 })
    );
    localStorage.setItem(
      'fg-view-draft:old',
      JSON.stringify({ draft: DRAFT, storedAt: Date.now() - 2 * day })
    );
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);

    act(() => {
      apiRef.current!.startDraftView(datasets, 'A');
    });

    await waitFor(() => expect(tab.location.href).not.toBe(''));
    expect(localStorage.getItem('fg-view-draft:recent')).not.toBeNull();
    expect(localStorage.getItem('fg-view-draft:old')).toBeNull();
  });

  it('falls back to this tab when the popup is blocked', async () => {
    vi.mocked(window.open).mockReturnValue(null);
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);

    act(() => {
      apiRef.current!.startDraftView(datasets, 'A');
    });

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/view/new', {
        state: { draft: DRAFT }
      })
    );
  });

  it('asks only for data-link consent (no name) when links are not automatic', async () => {
    automatic = false;
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);

    act(() => {
      apiRef.current!.startDraftView(datasets, 'A');
    });

    expect(
      await screen.findByText(/are you sure you want to create a data link/i)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('View name')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(tab.location.href).not.toBe(''));
  });

  it('toasts and stays put when the draft cannot be built', async () => {
    buildViewState.mockRejectedValue(new Error('No layers'));
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);

    act(() => {
      apiRef.current!.startDraftView(datasets, 'A');
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No layers'));
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe('');
    expect(navigate).not.toHaveBeenCalled();
  });
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

  it('focuses and selects the default name so typing replaces it', async () => {
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);

    act(() => {
      apiRef.current!.startCreateView(datasets, 'New View');
    });

    const input = await screen.findByLabelText('View name');
    expect(input).toHaveFocus();
    expect((input as HTMLInputElement).selectionStart).toBe(0);
    expect((input as HTMLInputElement).selectionEnd).toBe('New View'.length);
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

  it('asks no data-link consent for a bucket dataset, which needs no link', async () => {
    automatic = false;
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);

    act(() => {
      apiRef.current!.startCreateView(
        [{ fsp_name: 'bucket', path: 'sample.zarr', label: 'S' }],
        'A'
      );
    });

    expect(
      await screen.findByRole('button', { name: /^create$/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/are you sure you want to create a data link/i)
    ).toBeNull();
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

  it('adds to the View without a dialog when there is nothing to ask', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);
    act(() => {
      apiRef.current!.startAddToView(datasets, false, add);
    });
    await waitFor(() => expect(add).toHaveBeenCalledWith(datasets));
    expect(screen.queryByText('Add to this View')).toBeNull();
  });

  it('asks for Data Link consent before adding to the View', async () => {
    automatic = false;
    const add = vi.fn().mockResolvedValue(undefined);
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);
    act(() => {
      apiRef.current!.startAddToView(datasets, false, add);
    });
    expect(await screen.findByText('Add to this View')).toBeInTheDocument();
    expect(screen.queryByLabelText('View name')).toBeNull();
    expect(
      screen.getByText(/this will create 1 data link\./i)
    ).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(add).toHaveBeenCalledWith(datasets));
    await waitFor(() =>
      expect(screen.queryByText('Add to this View')).toBeNull()
    );
  });

  it("warns about a mismatch against the View's dimensions without blocking the add", async () => {
    // The cart-only check (mocked) finds no mismatch; the caller's View check does.
    const add = vi.fn().mockResolvedValue(undefined);
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);
    act(() => {
      apiRef.current!.startAddToView(datasets, true, add);
    });
    expect(
      await screen.findByText(/differ from the first layer/i)
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(add).toHaveBeenCalledWith(datasets));
  });

  it('shows Data Link consent and the mismatch warning together', async () => {
    automatic = false;
    const add = vi.fn().mockResolvedValue(undefined);
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);
    act(() => {
      apiRef.current!.startAddToView(datasets, true, add);
    });
    expect(
      await screen.findByText(/this will create 1 data link\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/differ from the first layer/i)
    ).toBeInTheDocument();
  });

  it('keeps the dialog open and shows the error when adding fails', async () => {
    automatic = false;
    const add = vi.fn().mockRejectedValue(new Error('link failed'));
    const errorSpy = vi.spyOn(toast, 'error');
    const apiRef: { current: FlowApi | null } = { current: null };
    render(<Harness apiRef={apiRef} />);
    act(() => {
      apiRef.current!.startAddToView(datasets, false, add);
    });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Continue' })
    );
    await waitFor(() => expect(errorSpy).toHaveBeenCalledWith('link failed'));
    expect(screen.getByText('Add to this View')).toBeInTheDocument();
    errorSpy.mockRestore();
  });
});
