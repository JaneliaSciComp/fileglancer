import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import AddBucketDialog from '@/components/ui/Dialogs/AddBucket';
import { render, screen, waitFor } from '@/__tests__/test-utils';
import { server } from '@/__tests__/mocks/node';

const CREATED = {
  name: 'idr_zarr',
  zone: 'S3',
  group: 'cloud',
  storage: 'idr',
  mount_path: 's3://idr',
  linux_path: null,
  mac_path: null,
  windows_path: null,
  protocol: 's3'
};

describe('AddBucketDialog', () => {
  it('fills the fields from a pasted path-style URL', async () => {
    const user = userEvent.setup();
    render(<AddBucketDialog onClose={vi.fn()} open />, {
      initialEntries: ['/browse']
    });
    await screen.findByLabelText('Endpoint URL');
    await user.type(
      screen.getByLabelText('URL'),
      'https://store.example.org/idr/zarr/v0.4/x.ome.zarr'
    );
    expect(screen.getByLabelText('Bucket name')).toHaveValue('idr');
    expect(screen.getByLabelText('Prefix')).toHaveValue('zarr/v0.4/x.ome.zarr');
    expect(screen.getByLabelText('Endpoint URL')).toHaveValue(
      'https://store.example.org'
    );
  });

  it('posts the structured fields and closes on success', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let body: unknown;
    server.use(
      http.post('/api/cloud-storage/buckets', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(CREATED);
      })
    );
    render(<AddBucketDialog onClose={onClose} open />, {
      initialEntries: ['/browse']
    });
    await screen.findByLabelText('Endpoint URL');
    await user.type(screen.getByLabelText('Bucket name'), 'idr');
    await user.type(screen.getByLabelText('Prefix'), '/zarr/');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body).toEqual({ protocol: 's3', bucket: 'idr', prefix: '/zarr/' });
  });

  it('shows the backend error inline', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const message =
      'Bucket is not public (authenticated buckets are not yet supported)';
    server.use(
      http.post('/api/cloud-storage/buckets', () =>
        HttpResponse.json({ error: message }, { status: 400 })
      )
    );
    render(<AddBucketDialog onClose={onClose} open />, {
      initialEntries: ['/browse']
    });
    await screen.findByLabelText('Endpoint URL');
    await user.type(screen.getByLabelText('Bucket name'), 'idr');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hides the endpoint field when the server allows AWS only', async () => {
    server.use(
      http.get('/api/cloud-storage/config', () =>
        HttpResponse.json({
          enabled: true,
          endpoint_url_allowed: false,
          allowed_endpoints: []
        })
      )
    );
    render(<AddBucketDialog onClose={vi.fn()} open />, {
      initialEntries: ['/browse']
    });
    await screen.findByLabelText('Bucket name');
    await new Promise(r => setTimeout(r, 50));
    expect(screen.queryByLabelText('Endpoint URL')).toBeNull();
  });
});
