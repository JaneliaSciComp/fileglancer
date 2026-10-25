import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';

import Sidebar from '@/components/ui/Sidebar/Sidebar';
import CloudStorageBrowser from '@/components/ui/Sidebar/CloudStorageBrowser';
import { render, screen, waitFor, within } from '@/__tests__/test-utils';
import { server } from '@/__tests__/mocks/node';

const LOCAL_SHARES = [
  {
    name: 'test_fsp',
    zone: 'Zone1',
    group: 'group1',
    storage: 'primary',
    mount_path: '/test/fsp',
    mac_path: 'smb://test/fsp',
    windows_path: '\\\\test\\fsp',
    linux_path: '/test/fsp',
    protocol: 'file' as const
  },
  {
    name: 'another_fsp',
    zone: 'Zone2',
    group: 'group2',
    storage: 'primary',
    mount_path: '/another/path',
    mac_path: 'smb://another/path',
    windows_path: '\\\\another\\path',
    linux_path: '/another/path',
    protocol: 'file' as const
  }
];

const EXAMPLE = {
  name: 'example',
  zone: 'S3',
  group: 'cloud',
  storage: 'Example',
  mount_path: 's3://example-datasets',
  linux_path: null,
  mac_path: null,
  windows_path: null,
  protocol: 's3' as const
};

function serveBucket() {
  server.use(
    http.get('/api/file-share-paths', () =>
      HttpResponse.json({ paths: [...LOCAL_SHARES, EXAMPLE] })
    )
  );
}

describe('CloudStorageBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Cloud Storage with the S3 group, the bucket and Add bucket', async () => {
    serveBucket();
    render(<Sidebar />, { initialEntries: ['/browse'] });

    expect(await screen.findByText('Cloud Storage')).toBeInTheDocument();
    const cloud = screen.getByLabelText('List of cloud storage buckets');
    expect(await within(cloud).findByText('Example')).toBeInTheDocument();
    expect(within(cloud).getByText('S3')).toBeInTheDocument();
    expect(
      within(cloud).getByText('s3://example-datasets')
    ).toBeInTheDocument();
    expect(
      within(cloud).getByRole('button', { name: 'Add bucket' })
    ).toBeInTheDocument();
  });

  it('activates its rows from the keyboard', async () => {
    const onAddBucket = vi.fn();
    const user = userEvent.setup();
    render(<CloudStorageBrowser onAddBucket={onAddBucket} searchQuery="" />, {
      initialEntries: ['/browse']
    });

    const addRow = await screen.findByRole('button', { name: 'Add bucket' });
    addRow.focus();
    await user.keyboard('{Enter}');
    expect(onAddBucket).toHaveBeenCalledTimes(1);
    await user.keyboard(' ');
    expect(onAddBucket).toHaveBeenCalledTimes(2);

    const header = screen.getByRole('button', { name: 'Cloud Storage' });
    expect(header).toHaveAttribute('tabindex', '0');
    expect(header).toHaveAttribute('aria-expanded', 'true');
    header.focus();
    await user.keyboard(' ');
    expect(header).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Enter}');
    expect(header).toHaveAttribute('aria-expanded', 'true');

    const group = screen.getByRole('button', { name: 'S3' });
    expect(group).toHaveAttribute('tabindex', '0');
    expect(group).toHaveAttribute('aria-expanded', 'true');
    group.focus();
    await user.keyboard('{Enter}');
    expect(group).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard(' ');
    expect(group).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps cloud zones out of the Zones section', async () => {
    serveBucket();
    render(<Sidebar />, { initialEntries: ['/browse'] });

    await screen.findByText('Zone1');
    const zones = screen.getByLabelText('List of file share paths within zone');
    expect(within(zones).queryByText('S3')).toBeNull();
    expect(within(zones).getByText('Zone1')).toBeInTheDocument();
  });

  it('shows the empty S3 group with Add bucket when the user has no buckets', async () => {
    render(<Sidebar />, { initialEntries: ['/browse'] });

    const cloud = await screen.findByLabelText('List of cloud storage buckets');
    expect(within(cloud).getByText('S3')).toBeInTheDocument();
    expect(
      within(cloud).getByRole('button', { name: 'Add bucket' })
    ).toBeInTheDocument();
  });

  it('renders nothing when the feature is disabled', async () => {
    server.use(
      http.get('/api/cloud-storage/config', () =>
        HttpResponse.json({
          enabled: false,
          endpoint_url_allowed: false,
          allowed_endpoints: null
        })
      )
    );
    render(<Sidebar />, { initialEntries: ['/browse'] });

    await screen.findByText('Zone1');
    expect(screen.queryByText('Cloud Storage')).toBeNull();
  });

  it('removes a bucket after confirming', async () => {
    serveBucket();
    let deleted = false;
    server.use(
      http.delete('/api/cloud-storage/buckets/example', () => {
        deleted = true;
        return HttpResponse.json({ name: 'example', removed_links: 2 });
      })
    );
    const user = userEvent.setup();
    render(<Sidebar />, { initialEntries: ['/browse'] });

    await user.click(
      await screen.findByRole('button', { name: 'Remove bucket Example' })
    );
    expect(
      await screen.findByText(
        'Remove "Example" from your Cloud Storage? Data links you created on it will be removed too. The bucket itself is not changed.'
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Removed bucket "Example" and 2 data links'
      );
    });
    expect(deleted).toBe(true);
  });

  it("removes all of the bucket's favorites in one write per list", async () => {
    serveBucket();
    const puts: Record<string, unknown> = {};
    server.use(
      http.get('/api/preference', () =>
        HttpResponse.json({
          path: { value: ['linux_path'] },
          fileSharePath: { value: [{ type: 'fsp', name: 'example' }] },
          folder: {
            value: [
              { type: 'folder', fspName: 'example', folderPath: 'a' },
              { type: 'folder', fspName: 'example', folderPath: 'b' },
              { type: 'folder', fspName: 'test_fsp', folderPath: 'c' }
            ]
          }
        })
      ),
      http.put('/api/preference/:key', async ({ params, request }) => {
        puts[params.key as string] = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete('/api/cloud-storage/buckets/example', () =>
        HttpResponse.json({ name: 'example', removed_links: 0 })
      )
    );
    const user = userEvent.setup();
    render(<Sidebar />, { initialEntries: ['/browse'] });

    // Wait for the favorites to load so the dialog sees them
    await waitFor(() => {
      expect(screen.getAllByText('Example').length).toBeGreaterThan(1);
    });
    await user.click(
      await screen.findByRole('button', { name: 'Remove bucket Example' })
    );
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(puts.folder).toEqual({
        value: [{ type: 'folder', fspName: 'test_fsp', folderPath: 'c' }]
      });
    });
    expect(puts.fileSharePath).toEqual({ value: [] });
    expect(toast.success).toHaveBeenCalledWith('Removed bucket "Example"');
  });
});
