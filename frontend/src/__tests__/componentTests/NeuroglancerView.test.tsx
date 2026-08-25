import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import type { ReactNode } from 'react';

const { useViewStateByReadKey } = vi.hoisted(() => ({
  useViewStateByReadKey: vi.fn()
}));
vi.mock('@/queries/viewQueries', () => ({ useViewStateByReadKey }));
vi.mock('@/hooks/useDefaultNeuroglancerBaseUrl', () => ({
  useInternalNeuroglancerBaseUrl: () => 'https://ng.example/'
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

import NeuroglancerView from '@/components/NeuroglancerView';

describe('NeuroglancerView', () => {
  beforeEach(() => {
    copyToClipboard.mockReset();
    copyToClipboard.mockResolvedValue({ success: true });
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

  it('copies the canonical short link (not the full-state hash URL or the external URL) when "Copy link" is clicked', async () => {
    const user = userEvent.setup();
    useViewStateByReadKey.mockReturnValue({
      data: { title: 'My View', layers: [{ name: 'L0' }] },
      isPending: false,
      isError: false
    });
    render(<NeuroglancerView />);
    await user.click(screen.getByRole('button', { name: /copy link/i }));
    expect(copyToClipboard).toHaveBeenCalledWith(
      `${window.location.origin}/view/rk1`
    );
    expect(copyToClipboard).not.toHaveBeenCalledWith(window.location.href);
    expect(copyToClipboard).not.toHaveBeenCalledWith(
      expect.stringContaining('https://ng.example/')
    );
  });
});
