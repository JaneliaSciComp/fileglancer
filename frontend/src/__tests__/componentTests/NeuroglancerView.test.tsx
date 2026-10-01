import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import toast from 'react-hot-toast';
import type { View } from '@/queries/viewQueries';
import { makeFakeBridge } from '@/__tests__/mocks/fakeNeuroglancer';

const { useViewStateByReadKey } = vi.hoisted(() => ({
  useViewStateByReadKey: vi.fn()
}));
const useViewsQuery = vi.hoisted(() => vi.fn(() => ({ data: [] as View[] })));
const mutateAsync = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const { bridgeRef } = vi.hoisted(() => ({
  bridgeRef: {
    current: null as null | ReturnType<
      typeof import('@/__tests__/mocks/fakeNeuroglancer').makeFakeBridge
    >
  }
}));
vi.mock('@/hooks/useNeuroglancerViewer', () => ({
  useNeuroglancerViewer: () => bridgeRef.current!.bridge
}));
vi.mock('@/queries/viewQueries', () => ({
  useViewStateByReadKey
}));
vi.mock('@/contexts/ViewsContext', () => ({
  useViewsContext: () => ({
    allViewsQuery: useViewsQuery(),
    updateViewMutation: { mutateAsync }
  })
}));
const ngBase = vi.hoisted(() => ({
  current: 'https://ng.example/' as string | null
}));
vi.mock('@/hooks/useDefaultNeuroglancerBaseUrl', () => ({
  useInternalNeuroglancerBaseUrl: () => ngBase.current
}));
vi.mock('react-router', () => ({
  useParams: () => ({ readKey: 'rk1' }),
  Link: ({ to, children }: { to: string; children: ReactNode }) =>
    createElement('a', { href: to }, children)
}));

const { copyToClipboard } = vi.hoisted(() => ({
  copyToClipboard: vi.fn()
}));
vi.mock('@/utils/copyText', () => ({ copyToClipboard }));

vi.mock('@/components/ui/Navbar/ProfileMenu', () => ({
  default: () => <div data-testid="profile-menu" />
}));

// ponytail: FgTooltip.Trigger duplicates its aria-label onto a wrapping div
// (see FgTooltip.tsx), which breaks getByLabelText with two matches. Mirror
// InlineNameEditor.test.tsx and strip the wrapper in tests.
vi.mock('@/components/ui/widgets/FgTooltip', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>
}));

vi.mock('@/components/ui/Views/ViewBrokenBanner', () => ({
  default: ({
    onRelink
  }: {
    onRelink: (t: {
      fsp_name: string;
      path: string;
      displayPath: string;
    }) => void;
  }) => (
    <button
      onClick={() =>
        onRelink({ fsp_name: 'fsp', path: 'a.zarr', displayPath: 'a.zarr' })
      }
      type="button"
    >
      banner relink
    </button>
  )
}));
vi.mock('@/components/ui/Dialogs/RelinkDialog', () => ({
  default: ({ onRelinked }: { onRelinked?: () => void }) => (
    <button onClick={() => onRelinked?.()} type="button">
      dialog relinked
    </button>
  )
}));

import NeuroglancerView from '@/components/NeuroglancerView';

const OWNED = {
  short_key: 'sk1',
  read_key: 'rk1',
  name: 'Mine',
  ng_state: {},
  sharing_mode: 'read',
  owner: 'me',
  created_at: '',
  updated_at: '',
  layers: []
} as unknown as View;

function renderViewer(options: { title?: string } = {}) {
  useViewStateByReadKey.mockReturnValue({
    data: { title: options.title, layers: [{ name: 'L0' }] },
    isPending: false,
    isError: false
  });
  return render(<NeuroglancerView />);
}

describe('NeuroglancerView', () => {
  beforeEach(() => {
    copyToClipboard.mockReset();
    copyToClipboard.mockResolvedValue({ success: true });
    useViewsQuery.mockReturnValue({ data: [] });
    ngBase.current = 'https://ng.example/';
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue(undefined);
    bridgeRef.current = makeFakeBridge({ layers: [{ name: 'L0' }] });
    window.history.replaceState(null, '', '/');
  });

  it('shows a loading state while pending', () => {
    useViewStateByReadKey.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false
    });
    render(<NeuroglancerView />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows "not found" when the key resolves to null', () => {
    useViewStateByReadKey.mockReturnValue({
      data: null,
      isPending: false,
      isError: false
    });
    render(<NeuroglancerView />);
    expect(screen.getByText(/view not found/i)).toBeInTheDocument();
  });

  it('iframes Neuroglancer with the inline state and shows the export actions', () => {
    useViewStateByReadKey.mockReturnValue({
      data: { title: 'My View', layers: [{ name: 'L0' }] },
      isPending: false,
      isError: false
    });
    render(<NeuroglancerView />);
    const iframe = screen.getByTitle(/neuroglancer/i) as HTMLIFrameElement;
    expect(iframe.src).toContain('https://ng.example/#!');
    expect(iframe.src).toContain(
      encodeURIComponent(
        JSON.stringify({ title: 'My View', layers: [{ name: 'L0' }] })
      )
    );
    expect(screen.getAllByText('My View').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', { name: /copy link/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /download json/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /open in neuroglancer/i })
    ).toBeInTheDocument();
  });

  it('shows a breadcrumb linking back to the Views list', () => {
    useViewStateByReadKey.mockReturnValue({
      data: { title: 'My View', layers: [{ name: 'L0' }] },
      isPending: false,
      isError: false
    });
    render(<NeuroglancerView />);
    const crumbLink = screen.getByRole('link', { name: /^views$/i });
    expect(crumbLink).toHaveAttribute('href', '/ngviews');
  });

  it('falls back to "Untitled View" when the view has no title', () => {
    useViewStateByReadKey.mockReturnValue({
      data: { layers: [{ name: 'L0' }] },
      isPending: false,
      isError: false
    });
    render(<NeuroglancerView />);
    expect(screen.getAllByText('Untitled View').length).toBeGreaterThan(0);
  });

  it('reflects the full state into the app URL hash after load', () => {
    const data = { title: 'My View', layers: [{ name: 'L0' }] };
    useViewStateByReadKey.mockReturnValue({
      data,
      isPending: false,
      isError: false
    });
    render(<NeuroglancerView />);
    expect(window.location.hash).toBe(
      '#!' + encodeURIComponent(JSON.stringify(data))
    );
  });

  it('copies the canonical short link (not the full-state hash URL or the external URL) when "Copy link to share" is clicked', async () => {
    const user = userEvent.setup();
    useViewStateByReadKey.mockReturnValue({
      data: { title: 'My View', layers: [{ name: 'L0' }] },
      isPending: false,
      isError: false
    });
    render(<NeuroglancerView />);
    await user.click(
      screen.getByRole('button', { name: 'Copy link to share' })
    );
    expect(copyToClipboard).toHaveBeenCalledWith(
      `${window.location.origin}/view/rk1`
    );
    expect(copyToClipboard).not.toHaveBeenCalledWith(window.location.href);
    expect(copyToClipboard).not.toHaveBeenCalledWith(
      expect.stringContaining('https://ng.example/')
    );
    expect(toast.success).toHaveBeenCalledWith('View link copied');
  });

  it('shows the owned View name with a rename control', async () => {
    useViewsQuery.mockReturnValue({ data: [OWNED] });
    renderViewer();
    expect(await screen.findByText('Mine')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Edit view name'));
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'Renamed{Enter}');
    expect(mutateAsync).toHaveBeenCalledWith({
      short_key: 'sk1',
      name: 'Renamed'
    });
  });

  it('shows a read-only title without a rename control when the View is not owned', () => {
    useViewsQuery.mockReturnValue({ data: [] });
    renderViewer({ title: 'Theirs' });
    expect(screen.getByText('Theirs')).toBeInTheDocument();
    expect(screen.queryByLabelText('Edit view name')).not.toBeInTheDocument();
  });

  it('shows the Save bar to the owner once the View has unsaved changes', async () => {
    useViewsQuery.mockReturnValue({ data: [OWNED] });
    renderViewer();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    act(() => bridgeRef.current!.interact());
    bridgeRef.current!.change({ layers: [{ name: 'L0' }], layout: '4panel' });
    expect(
      await screen.findByText(
        'Unsaved changes — saving updates this View for everyone with its link.'
      )
    ).toBeInTheDocument();
  });

  it('saves the live viewer state', async () => {
    useViewsQuery.mockReturnValue({ data: [OWNED] });
    renderViewer();
    act(() => bridgeRef.current!.interact());
    bridgeRef.current!.change({ layers: [{ name: 'L0' }], layout: '4panel' });
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(mutateAsync).toHaveBeenCalledWith({
      short_key: 'sk1',
      ng_state: { layers: [{ name: 'L0' }], layout: '4panel' }
    });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    );
    expect(toast.success).toHaveBeenCalledWith('View saved');
  });

  it('keeps unsaved changes when Save fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('Server error'));
    useViewsQuery.mockReturnValue({ data: [OWNED] });
    renderViewer();
    act(() => bridgeRef.current!.interact());
    bridgeRef.current!.change({ layers: [{ name: 'L0' }], layout: '4panel' });
    await userEvent.click(await screen.findByRole('button', { name: 'Save' }));
    expect(toast.error).toHaveBeenCalledWith('Server error');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('discard restores the saved state', async () => {
    useViewsQuery.mockReturnValue({ data: [OWNED] });
    const setState = vi.spyOn(bridgeRef.current!.bridge, 'setState');
    renderViewer();
    act(() => bridgeRef.current!.interact());
    bridgeRef.current!.change({ layers: [{ name: 'L0' }], layout: '4panel' });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Discard' })
    );
    expect(setState).toHaveBeenCalledWith({ layers: [{ name: 'L0' }] });
  });

  it('never shows the Save bar to a non-owner', async () => {
    useViewsQuery.mockReturnValue({ data: [] });
    renderViewer();
    act(() => bridgeRef.current!.interact());
    bridgeRef.current!.change({ layers: [], layout: '4panel' });
    await new Promise(r => setTimeout(r, 400));
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('tells the owner when editing is unavailable', () => {
    useViewsQuery.mockReturnValue({ data: [OWNED] });
    bridgeRef.current!.bridge.status = 'unavailable';
    renderViewer();
    expect(
      screen.getByText(
        "Editing isn't available with this Neuroglancer deployment"
      )
    ).toBeInTheDocument();
  });

  it('does not tell a non-owner that editing is unavailable', () => {
    bridgeRef.current!.bridge.status = 'unavailable';
    renderViewer();
    expect(
      screen.queryByText(
        "Editing isn't available with this Neuroglancer deployment"
      )
    ).toBeNull();
  });

  it('does not reload the iframe when the saved state refetches', () => {
    const { rerender } = renderViewer({ title: 'My View' });
    const iframe = screen.getByTitle(/neuroglancer/i) as HTMLIFrameElement;
    const src = iframe.src;
    useViewStateByReadKey.mockReturnValue({
      data: { title: 'My View', layers: [{ name: 'L0' }, { name: 'L1' }] },
      isPending: false,
      isError: false
    });
    rerender(<NeuroglancerView />);
    expect((screen.getByTitle(/neuroglancer/i) as HTMLIFrameElement).src).toBe(
      src
    );
  });

  it('warns before leaving with unsaved changes', async () => {
    useViewsQuery.mockReturnValue({ data: [OWNED] });
    renderViewer();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    act(() => bridgeRef.current!.interact());
    bridgeRef.current!.change({ layers: [], layout: '4panel' });
    await screen.findByRole('button', { name: 'Save' });
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('pushes the relinked state into the viewer', async () => {
    useViewsQuery.mockReturnValue({ data: [OWNED] });
    const relinked = { layers: [{ name: 'L0', source: 'new' }] };
    const refetch = vi.fn().mockResolvedValue({ data: relinked });
    useViewStateByReadKey.mockReturnValue({
      data: { layers: [{ name: 'L0' }] },
      isPending: false,
      isError: false,
      refetch
    });
    const setState = vi.spyOn(bridgeRef.current!.bridge, 'setState');
    render(<NeuroglancerView />);
    await userEvent.click(screen.getByText('banner relink'));
    await userEvent.click(screen.getByText('dialog relinked'));
    await waitFor(() => expect(setState).toHaveBeenCalledWith(relinked));
  });

  it('reloads the iframe with the relinked state when editing is unavailable', async () => {
    useViewsQuery.mockReturnValue({ data: [OWNED] });
    bridgeRef.current!.bridge.status = 'unavailable';
    const relinked = { layers: [{ name: 'L0', source: 'new' }] };
    useViewStateByReadKey.mockReturnValue({
      data: { layers: [{ name: 'L0' }] },
      isPending: false,
      isError: false,
      refetch: vi.fn().mockResolvedValue({ data: relinked })
    });
    render(<NeuroglancerView />);
    await userEvent.click(screen.getByText('banner relink'));
    await userEvent.click(screen.getByText('dialog relinked'));
    await waitFor(() =>
      expect(
        (screen.getByTitle(/neuroglancer/i) as HTMLIFrameElement).src
      ).toContain(encodeURIComponent(JSON.stringify(relinked)))
    );
  });

  it('shows no broken banner to a non-owner', () => {
    renderViewer();
    expect(screen.queryByText('banner relink')).toBeNull();
  });

  it('waits for the configured Neuroglancer before loading the iframe', () => {
    ngBase.current = null; // viewers config still loading
    const { rerender } = renderViewer();
    expect(screen.queryByTitle(/neuroglancer/i)).toBeNull();
    ngBase.current = 'https://ng.example/';
    rerender(<NeuroglancerView />);
    expect(
      (screen.getByTitle(/neuroglancer/i) as HTMLIFrameElement).src
    ).toContain('https://ng.example/#!');
  });

  it('does not warn a non-owner before leaving', async () => {
    renderViewer();
    act(() => bridgeRef.current!.interact());
    bridgeRef.current!.change({ layers: [], layout: '4panel' });
    await new Promise(r => setTimeout(r, 400));
    const leave = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leave);
    expect(leave.defaultPrevented).toBe(false);
  });

  it('keeps the viewer when a background refetch fails', () => {
    const { rerender } = renderViewer({ title: 'My View' });
    useViewStateByReadKey.mockReturnValue({
      data: { title: 'My View', layers: [{ name: 'L0' }] },
      isPending: false,
      isError: true
    });
    rerender(<NeuroglancerView />);
    expect(screen.getByTitle(/neuroglancer/i)).toBeInTheDocument();
  });

  it('tells the owner when Neuroglancer reloads with unsaved changes', async () => {
    useViewsQuery.mockReturnValue({ data: [OWNED] });
    const { rerender } = renderViewer();
    act(() => bridgeRef.current!.interact());
    bridgeRef.current!.change({ layers: [{ name: 'L0' }], layout: '4panel' });
    await screen.findByRole('button', { name: 'Save' });
    bridgeRef.current!.bridge.status = 'loading';
    rerender(<NeuroglancerView />);
    expect(toast.error).toHaveBeenCalledWith(
      'Neuroglancer reloaded, so unsaved changes may have been lost'
    );
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
