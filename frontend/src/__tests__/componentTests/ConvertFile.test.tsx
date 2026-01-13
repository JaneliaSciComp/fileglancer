import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { render, screen } from '@/__tests__/test-utils';
import toast from 'react-hot-toast';
import ConvertFileDialog from '@/components/ui/Dialogs/ConvertFile';

// Define mock value for propertiesTarget using vi.hoisted
const mockPropertiesTarget = vi.hoisted(() => {
  return {
    group: 'test_group',
    is_dir: true,
    last_modified: 1754405788.7264824,
    name: 'test_target',
    owner: 'test_user',
    path: 'test_target',
    permissions: 'drwxrwxr-x',
    size: 1024
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

describe('Convert File dialog', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const setShowConvertFileDialog = vi.fn();

    render(
      <ConvertFileDialog
        showConvertFileDialog={true}
        setShowConvertFileDialog={setShowConvertFileDialog}
      />,
      { initialEntries: ['/browse/test_fsp/my_folder'] }
    );

    await waitFor(() => {
      expect(
        screen.getByText('test_target', { exact: false })
      ).toBeInTheDocument();
    });
  });

  it('calls toast.success for an ok HTTP response', async () => {
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText('/path/to/destination/folder/'),
      '/test'
    );
    await user.type(
      screen.getByLabelText('Output File or Folder Name'),
      'output_file.zarr'
    );
    await user.click(
      screen.getByText('Submit', {
        selector: 'button[type="submit"]'
      })
    );
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Ticket created!');
    });
  });

  it('calls toast.error for a bad HTTP response', async () => {
    // Override the mock for this specific test to simulate an error
    const { server } = await import('@/__tests__/mocks/node');
    const { http, HttpResponse } = await import('msw');

    server.use(
      http.post('http://localhost:3000/api/ticket', () => {
        return HttpResponse.json(
          { error: 'Could not create ticket' },
          { status: 500 }
        );
      })
    );

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText('/path/to/destination/folder/'),
      '/test'
    );
    await user.type(
      screen.getByLabelText('Output File or Folder Name'),
      'output_file.zarr'
    );
    await user.click(
      screen.getByText('Submit', {
        selector: 'button[type="submit"]'
      })
    );
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        `Error creating ticket: 500 Internal Server Error:
Could not create ticket`
      );
    });
  });
});
