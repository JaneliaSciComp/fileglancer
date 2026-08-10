import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const { useViewStateByReadKey } = vi.hoisted(() => ({
  useViewStateByReadKey: vi.fn()
}));
vi.mock('@/queries/viewQueries', () => ({ useViewStateByReadKey }));
vi.mock('@/hooks/useDefaultNeuroglancerBaseUrl', () => ({
  useInternalNeuroglancerBaseUrl: () => 'https://ng.example/'
}));
vi.mock('react-router', () => ({ useParams: () => ({ readKey: 'rk1' }) }));

import NeuroglancerView from '@/components/NeuroglancerView';

describe('NeuroglancerView', () => {
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
    expect(screen.getByText('My View')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy link/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /download json/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /open external/i })
    ).toBeInTheDocument();
  });
});
