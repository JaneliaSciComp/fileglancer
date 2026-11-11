import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';

import { render, screen } from '@/__tests__/test-utils';
import { server } from '@/__tests__/mocks/node';
import Browse from '@/components/Browse';
import PropertiesDrawer from '@/components/ui/PropertiesDrawer/PropertiesDrawer';

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

const EXAMPLE = {
  name: 'example',
  zone: 'S3',
  group: 'cloud',
  storage: 'Example',
  mount_path: 'https://example-datasets.s3.amazonaws.com',
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
        HttpResponse.json({ paths: [TEST_FSP, EXAMPLE] })
      ),
      http.get('/api/files/example', () =>
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
              name: 'sample.zarr',
              path: 'sample.zarr',
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
    render(<Browse />, { initialEntries: ['/browse/example'] });

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

  it('shows the bucket path as an existing public data link instead of a Create switch', async () => {
    server.use(
      http.get('/api/external-buckets/example', () =>
        HttpResponse.json({
          buckets: [
            {
              id: null,
              full_path: 'https://example-datasets.s3.amazonaws.com',
              external_url: 'https://example-datasets.s3.amazonaws.com',
              fsp_name: 'example',
              relative_path: ''
            }
          ]
        })
      )
    );
    render(
      <PropertiesDrawer
        setShowConvertFileDialog={vi.fn()}
        setShowPermissionsDialog={vi.fn()}
        togglePropertiesDrawer={vi.fn()}
      />,
      { initialEntries: ['/browse/example'] }
    );

    expect(
      await screen.findByText(
        'This bucket is public, so its data link already exists.'
      )
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Create data link')).toBeDisabled();
    expect(
      screen.getByText('https://example-datasets.s3.amazonaws.com')
    ).toBeInTheDocument();
  });
});
