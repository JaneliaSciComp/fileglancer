import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userEvent } from '@testing-library/user-event';
import { waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { http, HttpResponse } from 'msw';

import { render, screen } from '@/__tests__/test-utils';
import { server } from '@/__tests__/mocks/node';
import RelinkDialog from '@/components/ui/Dialogs/RelinkDialog';

const target = {
  fsp_name: 'test_fsp',
  path: 'a/img.zarr',
  displayPath: '/test/a/img.zarr'
};
const link = (path: string) => ({
  id: 9,
  username: 'testuser',
  sharing_key: 'existing',
  sharing_name: 'img.zarr',
  path,
  fsp_name: 'test_fsp',
  created_at: '',
  updated_at: '',
  url: 'http://x/files/existing/img.zarr',
  url_prefix: 'img.zarr'
});

async function enabledButton(name: string) {
  const btn = await screen.findByRole('button', { name });
  await waitFor(() => expect(btn).toBeEnabled());
  return btn;
}

describe('RelinkDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a Data Link and relinks when none exists', async () => {
    const onClose = vi.fn();
    let urlPrefix: string | null = null;
    server.use(
      http.post('/api/proxied-path', ({ request }) => {
        urlPrefix = new URL(request.url).searchParams.get('url_prefix');
        return HttpResponse.json({
          ...link('a/img.zarr'),
          sharing_key: 'new',
          relinked_views: [{ short_key: 'v', name: 'V' }]
        });
      })
    );
    render(<RelinkDialog onClose={onClose} target={target} />, {
      initialEntries: ['/browse']
    });
    expect(await screen.findByText('/test/a/img.zarr')).toBeInTheDocument();
    await userEvent.setup().click(await enabledButton('Create Data Link'));
    // Default subpath mode is full_path: FSP linux_path + dataset path
    await waitFor(() => expect(urlPrefix).toBe('test/fsp/a/img.zarr'));
    expect(toast.success).toHaveBeenCalledWith('Relinked 1 broken View');
    expect(onClose).toHaveBeenCalled();
  });

  it('relinks onto an existing Data Link', async () => {
    let relinkedWith: unknown = null;
    server.use(
      http.get('/api/proxied-path', () =>
        HttpResponse.json({ paths: [link('a/img.zarr')] })
      ),
      http.post('/api/neuroglancer/views/relink', async ({ request }) => {
        relinkedWith = await request.json();
        return HttpResponse.json({ views: [{ short_key: 'v', name: 'V' }] });
      })
    );
    const onClose = vi.fn();
    render(<RelinkDialog onClose={onClose} target={target} />, {
      initialEntries: ['/browse']
    });
    await userEvent
      .setup()
      .click(await enabledButton('Relink using existing Data Link'));
    await waitFor(() =>
      expect(relinkedWith).toEqual({ sharing_key: 'existing' })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('finds an existing FSP-root link', async () => {
    server.use(
      http.get('/api/proxied-path', () =>
        HttpResponse.json({ paths: [link('')] })
      )
    );
    render(
      <RelinkDialog
        onClose={vi.fn()}
        target={{ ...target, path: '.', displayPath: '/test' }}
      />,
      { initialEntries: ['/browse'] }
    );
    expect(
      await screen.findByRole('button', {
        name: 'Relink using existing Data Link'
      })
    ).toBeInTheDocument();
  });

  it('shows the error and stays open when creating fails', async () => {
    const onClose = vi.fn();
    server.use(
      http.post('/api/proxied-path', () =>
        HttpResponse.json({ error: 'nope' }, { status: 500 })
      )
    );
    render(<RelinkDialog onClose={onClose} target={target} />, {
      initialEntries: ['/browse']
    });
    await userEvent.setup().click(await enabledButton('Create Data Link'));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('disables the action until Data Links have loaded', async () => {
    server.use(
      http.get('/api/proxied-path', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 })
      )
    );
    render(<RelinkDialog onClose={vi.fn()} target={target} />, {
      initialEntries: ['/browse']
    });
    const btn = await screen.findByRole('button', {
      name: 'Create Data Link'
    });
    await new Promise(r => setTimeout(r, 200));
    expect(btn).toBeDisabled();
  });
});
