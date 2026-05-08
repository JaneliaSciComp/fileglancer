import { describe, test, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import FileglancerNavbar from '@/components/ui/Navbar/Navbar';

vi.mock('@/hooks/useActiveJobCount', () => ({
  useActiveJobCount: vi.fn(() => 0)
}));

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: vi.fn(() => ({
    showAppsAndJobsPages: true
  }))
}));

vi.mock('@/hooks/useTheme', () => ({
  default: vi.fn(() => ({
    toggleTheme: vi.fn(),
    isLightTheme: true,
    setIsLightTheme: vi.fn()
  }))
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
import { usePreferencesContext } from '@/contexts/PreferencesContext';

const mockedUseActiveJobCount = vi.mocked(useActiveJobCount);
const mockedUsePreferencesContext = vi.mocked(usePreferencesContext);

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
    expect(screen.getByText('Jobs')).toBeInTheDocument();
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

  test('badge is not visible when Jobs link is hidden', () => {
    mockedUseActiveJobCount.mockReturnValue(5);
    mockedUsePreferencesContext.mockReturnValue({
      showAppsAndJobsPages: false
    } as ReturnType<typeof usePreferencesContext>);

    renderNavbar();

    expect(screen.queryByText('Jobs')).not.toBeInTheDocument();
    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });
});
