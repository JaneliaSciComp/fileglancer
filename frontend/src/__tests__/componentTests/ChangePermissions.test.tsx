import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import toast from 'react-hot-toast';

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

import ChangePermissions from '@/components/ui/Dialogs/ChangePermissions';
import { render, screen } from '@/__tests__/test-utils';

describe('Change Permissions dialog', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const setShowPermissionsDialog = vi.fn();

    render(
      <ChangePermissions
        showPermissionsDialog={true}
        setShowPermissionsDialog={setShowPermissionsDialog}
      />,
      { initialEntries: ['/browse/test_fsp/my_folder'] }
    );

    await waitFor(() => {
      const btn = screen.getByText('Change Permissions', {
        selector: 'button[type="submit"]'
      });
      expect(btn).toBeInTheDocument();
    });
  });

  it('displays permissions dialog for target file', () => {
    expect(screen.getByText('test_target')).toBeInTheDocument();
  });

  it('disables submit button when no changes are made', () => {
    const submitButton = screen.getByText('Change Permissions', {
      selector: 'button[type="submit"]'
    });
    expect(submitButton).toBeDisabled();
  });

  it('should update local permissions when input is checked', async () => {
    const user = userEvent.setup();
    const checkbox = screen.getByRole('checkbox', { name: 'w_8' });

    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    // Checkboxes are updated based on the local permissions state
    // Initial mock target state is 'drwxrwxr-x', it should now be 'drwxrwxrwx'
    expect(checkbox).toBeChecked();
  });

  it('calls toast.success for an ok HTTP response', async () => {
    const user = userEvent.setup();
    const checkbox = screen.getByRole('checkbox', { name: 'w_8' });
    await user.click(checkbox);
    await user.click(
      screen.getByText('Change Permissions', {
        selector: 'button[type="submit"]'
      })
    );
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Permissions changed!');
    });
  });

  it('calls toast.error for a bad HTTP response', async () => {
    // Override the mock for this specific test to simulate an error
    const { server } = await import('@/__tests__/mocks/node');
    const { http, HttpResponse } = await import('msw');

    server.use(
      http.patch('http://localhost:3000/api/files/:fspName', () => {
        return HttpResponse.json(
          { error: 'Permission denied' },
          { status: 403 }
        );
      })
    );

    const user = userEvent.setup();
    const checkbox = screen.getByRole('checkbox', { name: 'w_8' });
    await user.click(checkbox);
    await user.click(
      screen.getByText('Change Permissions', {
        selector: 'button[type="submit"]'
      })
    );
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        `Error changing permissions: 403 Forbidden:
Permission denied`
      );
    });
  });
});
