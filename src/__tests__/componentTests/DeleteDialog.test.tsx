import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import toast from 'react-hot-toast';

// Define mock value for propertiesTarget using vi.hoisted
const mockPropertiesTarget = vi.hoisted(() => {
  return {
    name: 'target_file',
    path: '/my_folder/target_file',
    size: 1024,
    is_dir: false,
    permissions: 'drwxr-xr-x',
    owner: 'testuser',
    group: 'testgroup',
    last_modified: 1647855213
  };
});

// Mock the FileBrowserContext module
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
          propertiesTarget: mockPropertiesTarget
        },
        propertiesTarget: mockPropertiesTarget
      };
    }
  };
});

import DeleteDialog from '@/components/ui/Dialogs/Delete';
import { render, screen } from '@/__tests__/test-utils';

describe('Delete dialog', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const setShowDeleteDialog = vi.fn();

    render(
      <DeleteDialog
        showDeleteDialog={true}
        setShowDeleteDialog={setShowDeleteDialog}
      />,
      { initialEntries: ['/browse/test_fsp/my_folder'] }
    );

    await waitFor(() => {
      expect(
        screen.getByText('/test/fsp', { exact: false })
      ).toBeInTheDocument();
    });
  });

  it('calls toast.success for an ok HTTP response', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Item deleted!');
    });
  });

  it('calls toast.error for a bad HTTP response', async () => {
    // Override the mock for this specific test to simulate an error
    const { server } = await import('@/__tests__/mocks/node');
    const { http, HttpResponse } = await import('msw');

    server.use(
      http.delete(
        'http://localhost:3000/api/files/test_fsp',
        () => {
          return HttpResponse.json(
            { error: 'Could not delete item' },
            { status: 500 }
          );
        }
      )
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Error deleting item: Could not delete item'
      );
    });
  });
});
