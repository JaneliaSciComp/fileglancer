import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import { render } from '../test-utils';
import { server } from '@/__tests__/mocks/node';
import FileBrowser from '@/components/ui/BrowsePage/FileBrowser';
import type { FileOrFolder } from '@/shared.types';

const addToCart = vi.fn();

vi.mock('@/contexts/CartContext', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/contexts/CartContext')>();
  return {
    ...actual,
    useCartContext: () => ({
      cart: [],
      cartCount: 0,
      addToCart,
      removeFromCart: vi.fn(),
      clearCart: vi.fn()
    })
  };
});

// FileBrowser also renders a "View in Neuroglancer" item that depends on
// useCreateViewFlow, which in turn needs a ViewsProvider this test's render
// tree doesn't set up. This suite only cares about the cart item, so stub
// the hook rather than wiring up ViewsProvider.
vi.mock('@/hooks/useCreateViewFlow', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/hooks/useCreateViewFlow')>();
  return {
    ...actual,
    useCreateViewFlow: () => ({
      startCreateView: vi.fn(),
      dialog: null,
      open: false,
      pending: false
    })
  };
});

// FileTable virtualizes rows in a way that doesn't render meaningfully in
// jsdom. Stub it with plain buttons that invoke the same
// handleContextMenuClick callback FileBrowser wires up, so the test can
// drive FileBrowser's real context-menu-item logic (name/shouldShow/action)
// without depending on virtualized-row DOM mechanics.
vi.mock('@/components/ui/BrowsePage/FileTable', () => ({
  default: ({
    data,
    handleContextMenuClick
  }: {
    data: FileOrFolder[];
    handleContextMenuClick: (e: unknown, file: FileOrFolder) => void;
  }) => (
    <div>
      {data.map(file => (
        <button key={file.path} onClick={e => handleContextMenuClick(e, file)}>
          menu-{file.name}
        </button>
      ))}
    </div>
  )
}));

const noop = vi.fn();

function renderFileBrowser() {
  return render(
    <FileBrowser
      mainPanelWidth={800}
      setShowConvertFileDialog={noop}
      setShowDeleteDialog={noop}
      setShowPermissionsDialog={noop}
      setShowRenameDialog={noop}
      showPropertiesDrawer={false}
      togglePropertiesDrawer={noop}
    />,
    { initialEntries: ['/browse/test_fsp/my_folder'] }
  );
}

describe('FileBrowser row context menu - Add to Neuroglancer cart', () => {
  beforeEach(() => {
    addToCart.mockClear();
    addToCart.mockResolvedValue(undefined);
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();

    server.use(
      http.get('/api/files/:fspName', ({ params, request }) => {
        const { fspName } = params;
        if (fspName !== 'test_fsp') {
          return HttpResponse.json({ error: 'Not found' }, { status: 404 });
        }
        const url = new URL(request.url);
        const subpath = url.searchParams.get('subpath') ?? 'my_folder';
        return HttpResponse.json({
          info: {
            name: subpath.split('/').pop(),
            path: subpath,
            size: 0,
            is_dir: true,
            permissions: 'drwxr-xr-x',
            owner: 'testuser',
            group: 'testgroup',
            last_modified: 1647855213
          },
          files: [
            { name: 'subfolder', is_dir: true, path: `${subpath}/subfolder` },
            { name: 'file1.txt', is_dir: false, path: `${subpath}/file1.txt` },
            {
              name: 'linked_folder',
              is_dir: true,
              is_symlink: true,
              symlink_target_fsp: null,
              path: `${subpath}/linked_folder`
            }
          ]
        });
      })
    );
  });

  it('adds a folder to the cart and toasts success', async () => {
    const user = userEvent.setup();
    renderFileBrowser();

    const menuButton = await screen.findByText('menu-subfolder');
    await user.click(menuButton);

    const cartItem = await screen.findByText('Add to Neuroglancer cart');
    await user.click(cartItem);

    expect(addToCart).toHaveBeenCalledWith([
      { fsp_name: 'test_fsp', path: 'my_folder/subfolder', label: 'subfolder' }
    ]);
    expect(toast.success).toHaveBeenCalledWith(
      'Added "subfolder" to the Neuroglancer cart'
    );
  });

  it('toasts an error and does not toast success when addToCart rejects', async () => {
    addToCart.mockRejectedValueOnce(new Error('preference update failed'));
    const user = userEvent.setup();
    renderFileBrowser();

    const menuButton = await screen.findByText('menu-subfolder');
    await user.click(menuButton);

    const cartItem = await screen.findByText('Add to Neuroglancer cart');
    await user.click(cartItem);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Error adding "subfolder" to the Neuroglancer cart: preference update failed'
      );
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not show the item for a plain file', async () => {
    const user = userEvent.setup();
    renderFileBrowser();

    const menuButton = await screen.findByText('menu-file1.txt');
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('Download')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Add to Neuroglancer cart')
    ).not.toBeInTheDocument();
    expect(addToCart).not.toHaveBeenCalled();
  });

  it('does not show the item for a symlinked folder', async () => {
    const user = userEvent.setup();
    renderFileBrowser();

    const menuButton = await screen.findByText('menu-linked_folder');
    await user.click(menuButton);

    await waitFor(() => {
      expect(screen.getByText('Rename')).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Add to Neuroglancer cart')
    ).not.toBeInTheDocument();
    expect(addToCart).not.toHaveBeenCalled();
  });
});
