import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { render } from '../test-utils';
import { server } from '@/__tests__/mocks/node';
import Browse from '@/components/Browse';

// Mock the StartTour component to avoid ShepherdJourneyProvider dependency
vi.mock('@/components/tours/StartTour', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  )
}));

// Mock useOutletContext since Browse requires it
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useOutletContext: () => ({
      setShowPermissionsDialog: vi.fn(),
      togglePropertiesDrawer: vi.fn(),
      toggleSidebar: vi.fn(),
      setShowConvertFileDialog: vi.fn(),
      showPermissionsDialog: false,
      showPropertiesDrawer: false,
      showSidebar: false,
      showConvertFileDialog: false,
      propertiesDrawerMode: 'properties',
      selectDrawerMode: vi.fn()
    })
  };
});

// FileBrowser renders a "View in Neuroglancer" item that depends on
// useCreateViewFlow, which needs a ViewsProvider this test's render tree
// doesn't set up. This suite only cares about the select column, so stub
// the hook rather than wiring up ViewsProvider.
vi.mock('@/hooks/useCreateViewFlow', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/hooks/useCreateViewFlow')>();
  return {
    ...actual,
    useCreateViewFlow: () => ({
      startCreateView: vi.fn(),
      consentDialog: null,
      consentOpen: false,
      pending: false
    })
  };
});

describe('FileTable select column', () => {
  it('renders a "Select all" header checkbox that toggles on click', async () => {
    server.use(
      http.get('/api/files/:fspName', ({ params, request }) => {
        const url = new URL(request.url);
        const subpath = url.searchParams.get('subpath');
        const { fspName } = params;

        if (fspName === 'myFsp') {
          return HttpResponse.json({
            info: {
              name: subpath ? subpath.split('/').pop() : '',
              path: subpath || '.',
              size: 0,
              is_dir: true,
              permissions: 'drwxr-xr-x',
              owner: 'testuser',
              group: 'testgroup',
              last_modified: 1647855213
            },
            files: [
              {
                name: 'file1.txt',
                is_dir: false,
                path: `${subpath}/file1.txt`
              },
              { name: 'file2.txt', is_dir: false, path: `${subpath}/file2.txt` }
            ]
          });
        }
        return HttpResponse.json({ error: 'Not found' }, { status: 404 });
      })
    );

    const user = userEvent.setup();
    render(<Browse />, { initialEntries: ['/browse/myFsp/dir'] });

    const selectAll = await screen.findByRole('checkbox', {
      name: /select all/i
    });
    expect(selectAll).not.toBeChecked();

    await user.click(selectAll);
    await waitFor(() => expect(selectAll).toBeChecked());

    await user.click(selectAll);
    await waitFor(() => expect(selectAll).not.toBeChecked());
  });
});
