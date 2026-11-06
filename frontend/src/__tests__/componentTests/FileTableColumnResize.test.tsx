import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { render } from '../test-utils';
import { server } from '@/__tests__/mocks/node';
import Browse from '@/components/Browse';

vi.mock('@/components/tours/StartTour', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  )
}));

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
      selectDrawerMode: vi.fn(),
      openDrawer: vi.fn()
    })
  };
});

describe('FileTable column resize', () => {
  it('moves the divider between Name and Type, keeping the total width', async () => {
    server.use(
      http.get('/api/files/:fspName', ({ request }) => {
        const subpath = new URL(request.url).searchParams.get('subpath');
        return HttpResponse.json({
          info: {
            name: 'dir',
            path: subpath,
            size: 0,
            is_dir: true,
            permissions: 'drwxr-xr-x',
            owner: 'testuser',
            group: 'testgroup',
            last_modified: 1647855213
          },
          files: [
            { name: 'file1.txt', is_dir: false, path: `${subpath}/file1.txt` }
          ]
        });
      })
    );

    render(<Browse />, { initialEntries: ['/browse/myFsp/dir'] });
    // Virtualized rows never render in jsdom, so check the header grid
    const row = (await screen.findByText('Name')).closest(
      '.grid'
    ) as HTMLElement;

    // happy-dom has no layout, so widths stay at the column defaults in px
    const before = row.style.gridTemplateColumns.split(' ');
    const nameWidth = parseInt(before[1], 10);
    const typeWidth = parseInt(before[2], 10);

    const nameHandle = screen
      .getByText('Name')
      .closest('.relative')!
      .querySelector('.cursor-col-resize')!;
    // Shrink Name by 60px: Name loses 60, Type gains 60, nothing else moves
    fireEvent.mouseDown(nameHandle, { clientX: 160 });
    fireEvent.mouseMove(document, { clientX: 100 });
    fireEvent.mouseUp(document, { clientX: 100 });

    await waitFor(() => {
      const after = row.style.gridTemplateColumns.split(' ');
      expect(parseInt(after[1], 10)).toBe(nameWidth - 60);
      expect(parseInt(after[2], 10)).toBe(typeWidth + 60);
      expect(after.slice(3)).toEqual(before.slice(3));
    });
  });
});
