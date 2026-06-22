import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { render, screen } from '@/__tests__/test-utils';
import { server } from '@/__tests__/mocks/node';
import PropertiesDrawer from '@/components/ui/PropertiesDrawer/PropertiesDrawer';

// Mutable mock state so individual tests can swap the propertiesTarget between
// a regular file and a symlink. The context mock reads `mocks.propertiesTarget`
// at call time, so reassigning it before rendering changes what the drawer sees.
const mocks = vi.hoisted(() => {
  const fileTarget = {
    group: 'test_group',
    is_dir: false,
    is_symlink: false,
    last_modified: 1754405788.0,
    name: 'test_file.tiff',
    owner: 'test_user',
    path: 'my_folder/test_file.tiff',
    permissions: '-rw-r--r--',
    size: 204800,
    hasRead: true,
    hasWrite: false
  };
  const symlinkTarget = {
    ...fileTarget,
    is_symlink: true,
    name: 'test_symlink.tiff',
    path: 'my_folder/test_symlink.tiff',
    permissions: 'lrwxr-xr-x'
  };
  return {
    fileTarget,
    symlinkTarget,
    propertiesTarget: fileTarget
  };
});

// Mock FileBrowserContext so propertiesTarget reflects the current mock target.
vi.mock(import('../../contexts/FileBrowserContext'), async importOriginal => {
  const originalModule = await importOriginal();
  const { useFileBrowserContext } = originalModule;

  return {
    ...originalModule,
    useFileBrowserContext: () => {
      const originalContext = useFileBrowserContext();
      return {
        ...originalContext,
        fileBrowserState: {
          ...originalContext.fileBrowserState,
          propertiesTarget: mocks.propertiesTarget,
          dataLinkPath: mocks.propertiesTarget.path
        }
      };
    }
  };
});

// MSW handler override: serve a file/symlink info response for the target path.
// The default handler for /api/files/:fspName always returns is_dir: true, so
// this per-test server.use() provides info matching the current mock target.
function useFilesHandlerForTarget() {
  server.use(
    http.get('/api/files/:fspName', ({ params, request }) => {
      const url = new URL(request.url);
      const subpath = url.searchParams.get('subpath');
      const { fspName } = params;
      const target = mocks.propertiesTarget;

      if (fspName === 'test_fsp' && subpath === target.path) {
        return HttpResponse.json({
          info: {
            name: target.name,
            path: target.path,
            size: target.size,
            is_dir: false,
            is_symlink: target.is_symlink,
            permissions: target.permissions,
            owner: target.owner,
            group: target.group,
            last_modified: target.last_modified
          },
          files: []
        });
      }

      // Fallback: parent folder
      if (fspName === 'test_fsp') {
        return HttpResponse.json({
          info: {
            name: subpath ? subpath.split('/').pop() : '',
            path: subpath || '.',
            size: 1024,
            is_dir: true,
            permissions: 'drwxr-xr-x',
            owner: 'testuser',
            group: 'testgroup',
            last_modified: 1647855213
          },
          files: [
            {
              name: target.name,
              is_dir: false,
              is_symlink: target.is_symlink,
              path: target.path,
              size: target.size,
              permissions: target.permissions,
              owner: target.owner,
              group: target.group,
              last_modified: target.last_modified
            }
          ]
        });
      }
      return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    })
  );
}

function renderDrawer() {
  return render(
    <PropertiesDrawer
      togglePropertiesDrawer={vi.fn()}
      setShowPermissionsDialog={vi.fn()}
      setShowConvertFileDialog={vi.fn()}
    />,
    { initialEntries: ['/browse/test_fsp/my_folder'] }
  );
}

describe('PropertiesDrawer - data link toggle for a regular file', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.propertiesTarget = mocks.fileTarget;
    useFilesHandlerForTarget();
    renderDrawer();

    // Wait for the file name to appear (confirms propertiesTarget is rendered)
    await waitFor(() => {
      expect(screen.getByText('test_file.tiff')).toBeInTheDocument();
    });
  });

  it('renders the "Create data link" toggle for a regular file target', async () => {
    await waitFor(() => {
      expect(screen.getByText('Create data link')).toBeInTheDocument();
    });
  });

  it('renders the "Learn more about data links" link for a file without an existing data link', async () => {
    await waitFor(() => {
      expect(
        screen.getByText('Learn more about data links')
      ).toBeInTheDocument();
    });
  });
});

describe('PropertiesDrawer - data link toggle for a symlink', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.propertiesTarget = mocks.symlinkTarget;
    useFilesHandlerForTarget();
    renderDrawer();

    // Wait for the symlink name to appear (confirms propertiesTarget is rendered)
    await waitFor(() => {
      expect(screen.getByText('test_symlink.tiff')).toBeInTheDocument();
    });
  });

  it('renders the data link toggle for a symlink target', async () => {
    // Data-link controls are shown for any path, including symlinks (to files or
    // directories). Wait for the loading state to resolve before asserting the
    // controls are present.
    await waitFor(() => {
      expect(
        screen.queryByText('Loading data link information...')
      ).not.toBeInTheDocument();
    });

    expect(screen.getByText('Create data link')).toBeInTheDocument();
    expect(screen.getByText('Learn more about data links')).toBeInTheDocument();
  });
});
