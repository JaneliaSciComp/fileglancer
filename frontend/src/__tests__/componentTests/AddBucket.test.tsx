import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AddBucketDialog from '@/components/ui/Dialogs/AddBucket';
import { useCreateCloudBucketMutation } from '@/queries/cloudStorageQueries';
import { render, renderHook, screen, waitFor } from '@/__tests__/test-utils';
import { server } from '@/__tests__/mocks/node';

const CREATED = {
  name: 'idr_zarr',
  zone: 'S3',
  group: 'cloud',
  storage: 'idr',
  mount_path: 'https://idr.s3.amazonaws.com',
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
    await user.type(screen.getByLabelText('Bucket name'), ' idr ');
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

  const serveConfig = (config: object) => {
    const state = { consumed: false };
    server.use(
      http.get('/api/cloud-storage/config', () => {
        state.consumed = true;
        return HttpResponse.json(config);
      })
    );
    return state;
  };

  const capturePost = () => {
    const state: { body?: Record<string, unknown> } = {};
    server.use(
      http.post('/api/cloud-storage/buckets', async ({ request }) => {
        state.body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(CREATED);
      })
    );
    return state;
  };

  it('refuses a pasted endpoint when endpoints are not allowed', async () => {
    const user = userEvent.setup();
    const cfg = serveConfig({
      enabled: true,
      endpoint_url_allowed: false,
      allowed_endpoints: []
    });
    const posted = capturePost();
    render(<AddBucketDialog onClose={vi.fn()} open />, {
      initialEntries: ['/browse']
    });
    await waitFor(() => expect(cfg.consumed).toBe(true));
    await user.type(
      screen.getByLabelText('URL'),
      'https://store.example.org/idr/zarr'
    );
    expect(screen.getByLabelText('Bucket name')).toHaveValue('');
    expect(screen.getByLabelText('Prefix')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent(
      'This server does not allow the endpoint https://store.example.org; ask the administrator.'
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(posted.body).toBeUndefined();
  });

  it('still fills an AWS URL when endpoints are not allowed', async () => {
    const user = userEvent.setup();
    const cfg = serveConfig({
      enabled: true,
      endpoint_url_allowed: false,
      allowed_endpoints: []
    });
    render(<AddBucketDialog onClose={vi.fn()} open />, {
      initialEntries: ['/browse']
    });
    await waitFor(() => expect(cfg.consumed).toBe(true));
    await user.type(screen.getByLabelText('URL'), 's3://idr/zarr');
    expect(screen.getByLabelText('Bucket name')).toHaveValue('idr');
    expect(screen.getByLabelText('Prefix')).toHaveValue('zarr');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('refuses a pasted endpoint that is not in the allowed list', async () => {
    const user = userEvent.setup();
    serveConfig({
      enabled: true,
      endpoint_url_allowed: true,
      allowed_endpoints: ['https://s3.example.org']
    });
    const posted = capturePost();
    render(<AddBucketDialog onClose={vi.fn()} open />, {
      initialEntries: ['/browse']
    });
    const select = await screen.findByLabelText('Endpoint URL');
    await user.type(
      screen.getByLabelText('URL'),
      'https://store.example.org/idr/zarr'
    );
    expect(select).toHaveValue('');
    expect(screen.getByLabelText('Bucket name')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent(
      'This server does not allow the endpoint https://store.example.org; ask the administrator.'
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(posted.body).toBeUndefined();
  });

  it('selects a pasted endpoint that is in the allowed list', async () => {
    const user = userEvent.setup();
    serveConfig({
      enabled: true,
      endpoint_url_allowed: true,
      allowed_endpoints: ['https://s3.example.org']
    });
    const posted = capturePost();
    render(<AddBucketDialog onClose={vi.fn()} open />, {
      initialEntries: ['/browse']
    });
    const select = await screen.findByLabelText('Endpoint URL');
    await user.type(
      screen.getByLabelText('URL'),
      'https://s3.example.org/idr/zarr'
    );
    expect(select).toHaveValue('https://s3.example.org');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(posted.body).toBeDefined());
    expect(posted.body?.endpoint_url).toBe('https://s3.example.org');
  });

  it('settles only after the share list has been invalidated', async () => {
    server.use(
      http.post('/api/cloud-storage/buckets', () => HttpResponse.json(CREATED))
    );
    const client = new QueryClient();
    let release!: () => void;
    const invalidate = vi
      .spyOn(client, 'invalidateQueries')
      .mockReturnValue(new Promise<void>(r => (release = r)));
    const { result } = renderHook(() => useCreateCloudBucketMutation(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
    });
    let settled = false;
    const done = result.current
      .mutateAsync({ protocol: 's3', bucket: 'idr' })
      .then(() => (settled = true));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['fileSharePaths'] })
    );
    await new Promise(r => setTimeout(r, 20));
    expect(settled).toBe(false);
    release();
    await done;
    expect(settled).toBe(true);
  });
});
