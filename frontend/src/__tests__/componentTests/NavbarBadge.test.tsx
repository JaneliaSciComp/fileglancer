import { describe, test, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import FileglancerNavbar from '@/components/ui/Navbar/Navbar';
import type { CartItem } from '@/queries/preferencesQueries';

vi.mock('@/hooks/useActiveJobCount', () => ({
  useActiveJobCount: vi.fn(() => 0)
}));

let cartData: CartItem[] = [];

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({
    preferenceQuery: { data: { neuroglancerCart: cartData } }
  })
}));

vi.mock('@/utils/fathom', () => ({
  trackEvent: vi.fn()
}));

vi.mock('@/components/ui/Navbar/ProfileMenu', () => ({
  default: () => <div data-testid="profile-menu" />
}));

vi.mock('@/components/ui/widgets/FgTooltip', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

import { useActiveJobCount } from '@/hooks/useActiveJobCount';
import { useCartCount } from '@/hooks/useCartCount';

const mockedUseActiveJobCount = vi.mocked(useActiveJobCount);

function renderNavbar() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/browse']}>
        <FileglancerNavbar />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Navbar badge', () => {
  test('badge is not visible when active job count is 0', () => {
    mockedUseActiveJobCount.mockReturnValue(0);

    renderNavbar();

    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('Apps')).toBeInTheDocument();
  });

  test('badge shows correct count when active jobs exist', () => {
    mockedUseActiveJobCount.mockReturnValue(3);

    renderNavbar();

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('badge shows "9+" when count exceeds 9', () => {
    mockedUseActiveJobCount.mockReturnValue(15);

    renderNavbar();

    expect(screen.getByText('9+')).toBeInTheDocument();
  });
});

describe('useCartCount', () => {
  it('counts datasets, not channel entries', () => {
    cartData = [
      { fsp_name: 'f', path: '/a.zarr', label: 'a' },
      {
        fsp_name: 'f',
        path: '/a.zarr',
        label: 'DAPI',
        channel: 'DAPI',
        channelIndex: 0
      },
      {
        fsp_name: 'f',
        path: '/a.zarr',
        label: 'GFP',
        channel: 'GFP',
        channelIndex: 1
      },
      { fsp_name: 'f', path: '/b.zarr', label: 'b' }
    ];

    const { result } = renderHook(() => useCartCount());

    expect(result.current).toBe(2);
  });
});
