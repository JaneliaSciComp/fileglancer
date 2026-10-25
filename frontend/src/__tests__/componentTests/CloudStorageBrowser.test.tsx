import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import toast from 'react-hot-toast';

import Sidebar from '@/components/ui/Sidebar/Sidebar';
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

const COSEM = {
  name: 'cosem',
  zone: 'S3',
  group: 'cloud',
  storage: 'COSEM',
  mount_path: 's3://janelia-cosem-datasets',
  linux_path: null,
  mac_path: null,
  windows_path: null,
  protocol: 's3' as const
};

function serveBucket() {
  server.use(
    http.get('/api/file-share-paths', () =>
      HttpResponse.json({ paths: [...LOCAL_SHARES, COSEM] })
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
    expect(await within(cloud).findByText('COSEM')).toBeInTheDocument();
    expect(within(cloud).getByText('S3')).toBeInTheDocument();
    expect(
      within(cloud).getByText('s3://janelia-cosem-datasets')
    ).toBeInTheDocument();
    expect(
      within(cloud).getByRole('button', { name: 'Add bucket' })
    ).toBeInTheDocument();
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
      http.delete('/api/cloud-storage/buckets/cosem', () => {
        deleted = true;
        return HttpResponse.json({ name: 'cosem', removed_links: 2 });
      })
    );
    const user = userEvent.setup();
    render(<Sidebar />, { initialEntries: ['/browse'] });

    await user.click(
      await screen.findByRole('button', { name: 'Remove bucket COSEM' })
    );
    expect(
      await screen.findByText(
        'Remove "COSEM" from your Cloud Storage? Data links you created on it will be removed too. The bucket itself is not changed.'
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Removed bucket "COSEM" and 2 data links'
      );
    });
    expect(deleted).toBe(true);
  });
});
