import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { render, screen } from '@/__tests__/test-utils';
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
      selectDrawerMode: vi.fn()
    })
  };
});

const TEST_FSP = {
  name: 'test_fsp',
  zone: 'Zone1',
  group: 'group1',
  storage: 'primary',
  mount_path: '/test/fsp',
  mac_path: 'smb://test/fsp',
  windows_path: '\\\\test\\fsp',
  linux_path: '/test/fsp',
  protocol: 'file' as const
};

const COSEM = {
  name: 'cosem',
  zone: 'S3',
  group: 'cloud',
  storage: 'COSEM',
  mount_path: 's3://cosem-datasets',
  linux_path: null,
  mac_path: null,
  windows_path: null,
  protocol: 's3' as const
};

const READ_ONLY = {
  permissions: 'dr-xr-xr-x',
  owner: '',
  group: '',
  hasRead: true,
  hasWrite: false
};

describe('Read-only gating', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/file-share-paths', () =>
        HttpResponse.json({ paths: [TEST_FSP, COSEM] })
      ),
      http.get('/api/files/cosem', () =>
        HttpResponse.json({
          info: {
            ...READ_ONLY,
            name: '',
            path: '.',
            size: 0,
            is_dir: true,
            last_modified: 0
          },
          files: [
            {
              ...READ_ONLY,
              name: 'jrc_hela-2',
              path: 'jrc_hela-2',
              size: 0,
              is_dir: true,
              last_modified: 0
            }
          ]
        })
      )
    );
  });

  it('offers no New folder button on a bucket', async () => {
    render(<Browse />, { initialEntries: ['/browse/cosem'] });

    // Rendered under the same is-a-folder condition as New folder
    expect(
      await screen.findByRole('button', { name: /hide dot files/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new folder/i })).toBeNull();
  });

  it('still offers New folder on a file share', async () => {
    render(<Browse />, { initialEntries: ['/browse/test_fsp'] });

    expect(
      await screen.findByRole('button', { name: /new folder/i })
    ).toBeInTheDocument();
  });
});
