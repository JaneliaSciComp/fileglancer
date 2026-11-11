import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';

// MainLayout composes ~a dozen context providers unrelated to this test;
// stub them all as passthroughs so we can assert on the one thing that
// changed: the navbar is now skipped for /view/:readKey.
// vi.mock factories are hoisted above imports, so the shared stub must be
// created via vi.hoisted rather than a plain top-level const.
const { passthrough } = vi.hoisted(() => ({
  passthrough: ({ children }: { children: ReactNode }) => children
}));

vi.mock('@/components/ui/Navbar/Navbar', () => ({
  default: () => <div data-testid="navbar" />
}));
vi.mock('@/components/ui/Notifications/Notifications', () => ({
  default: () => null
}));
vi.mock('@/components/ui/Dialogs/ServerDownOverlay', () => ({
  ServerDownOverlay: () => null
}));
vi.mock('react-shepherd', () => ({
  ShepherdJourneyProvider: passthrough
}));
vi.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(() => {}, { success: vi.fn(), error: vi.fn() }),
  Toaster: () => null
}));
vi.mock('@/contexts/ServerHealthContext', () => ({
  ServerHealthProvider: passthrough,
  useServerHealthContext: () => ({
    showWarningOverlay: false,
    checkHealth: vi.fn(),
    nextRetrySeconds: 0
  })
}));
vi.mock('@/contexts/ZonesAndFspMapContext', () => ({
  ZonesAndFspMapContextProvider: passthrough
}));
vi.mock('@/contexts/FileBrowserContext', () => ({
  FileBrowserContextProvider: passthrough
}));
vi.mock('@/contexts/PreferencesContext', () => ({
  PreferencesProvider: passthrough
}));
vi.mock('@/contexts/CartContext', () => ({ CartProvider: passthrough }));
vi.mock('@/contexts/ViewsContext', () => ({ ViewsProvider: passthrough }));
vi.mock('@/contexts/OpenFavoritesContext', () => ({
  OpenFavoritesProvider: passthrough
}));
vi.mock('@/contexts/TicketsContext', () => ({ TicketProvider: passthrough }));
vi.mock('@/contexts/ProxiedPathContext', () => ({
  ProxiedPathProvider: passthrough
}));
vi.mock('@/contexts/ExternalBucketContext', () => ({
  ExternalBucketProvider: passthrough
}));
vi.mock('@/contexts/ProfileContext', () => ({
  ProfileContextProvider: passthrough
}));
vi.mock('@/contexts/NotificationsContext', () => ({
  NotificationProvider: passthrough
}));
vi.mock('@/contexts/ViewersContext', () => ({ ViewersProvider: passthrough }));

import { MainLayout } from '@/layouts/MainLayout';

describe('MainLayout', () => {
  it('suppresses the navbar on the embedded viewer route (/view/:readKey)', () => {
    render(
      <MemoryRouter initialEntries={['/view/abc123']}>
        <Routes>
          <Route element={<MainLayout />} path="/*">
            <Route element={<div>viewer</div>} path="view/:readKey" />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByTestId('navbar')).not.toBeInTheDocument();
  });

  it('still renders the navbar on an ordinary route', () => {
    render(
      <MemoryRouter initialEntries={['/browse']}>
        <Routes>
          <Route element={<MainLayout />} path="/*">
            <Route element={<div>browse</div>} path="browse" />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
  });
});
