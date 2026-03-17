import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { render, screen } from '@/__tests__/test-utils';
import toast from 'react-hot-toast';
import DataLinkDialog from '@/components/ui/Dialogs/DataLink';
import type { OpenWithToolUrls } from '@/hooks/useZarrMetadata';
import useDataToolLinks from '@/hooks/useDataToolLinks';

const mockOpenWithToolUrls: OpenWithToolUrls = {
  copy: 'http://localhost:3000/test/copy/url',
  validator: 'http://localhost:3000/test/validator/url',
  neuroglancer: 'http://localhost:3000/test/neuroglancer/url',
  vole: 'http://localhost:3000/test/vole/url',
  avivator: 'http://localhost:3000/test/avivator/url'
};

// Test component that integrates the real hook with the dialog
function TestDataLinkComponent() {
  const { handleDialogConfirm } = useDataToolLinks(
    vi.fn(),
    mockOpenWithToolUrls,
    'copy',
    vi.fn()
  );

  return (
    <DataLinkDialog
      tools={true}
      action="create"
      showDataLinkDialog={true}
      setShowDataLinkDialog={vi.fn()}
      onConfirm={handleDialogConfirm}
      onCancel={vi.fn()}
      setPendingToolKey={vi.fn()}
    />
  );
}

describe('Data Link dialog', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    render(<TestDataLinkComponent />, {
      initialEntries: ['/browse/test_fsp/my_folder/my_zarr']
    });

    await waitFor(() => {
      expect(screen.getByText('my_zarr', { exact: false })).toBeInTheDocument();
    });
  });

  it('shows the display name input pre-populated with the path basename', async () => {
    await waitFor(() => {
      expect(screen.getByDisplayValue('my_zarr')).toBeInTheDocument();
    });
    const nameInput = screen.getByDisplayValue('my_zarr');
    expect(nameInput).toHaveAttribute('type', 'text');
  });

  it('calls toast.success for an ok HTTP response', async () => {
    const user = userEvent.setup();
    // Wait for the sharing name input to be populated from async query
    await waitFor(() => {
      expect(screen.getByDisplayValue('my_zarr')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Create Data Link'));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Data link created successfully'
      );
    });
  });

  it('allows the user to set a custom sharing name', async () => {
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByDisplayValue('my_zarr')).toBeInTheDocument();
    });
    const nameInput = screen.getByDisplayValue('my_zarr');

    await user.clear(nameInput);
    await user.type(nameInput, 'My Custom Name');

    expect(nameInput).toHaveValue('My Custom Name');

    await user.click(screen.getByText('Create Data Link'));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Data link created successfully'
      );
    });
  });

  it('shows validation error when sharing name is empty', async () => {
    const user = userEvent.setup();
    await waitFor(() => {
      expect(screen.getByDisplayValue('my_zarr')).toBeInTheDocument();
    });
    const nameInput = screen.getByDisplayValue('my_zarr');

    await user.clear(nameInput);

    await user.click(screen.getByText('Create Data Link'));
    await waitFor(() => {
      expect(screen.getByText('Nickname cannot be empty')).toBeInTheDocument();
    });
    // toast.success should NOT have been called
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('calls toast.error for a bad HTTP response', async () => {
    // Override the mock for this specific test to simulate an error
    const { server } = await import('@/__tests__/mocks/node');
    const { http, HttpResponse } = await import('msw');

    server.use(
      http.post('/api/proxied-path', () => {
        return HttpResponse.json(
          { error: 'Could not create data link' },
          { status: 500 }
        );
      })
    );

    const user = userEvent.setup();
    // Wait for the sharing name input to be populated from async query
    await waitFor(() => {
      expect(screen.getByDisplayValue('my_zarr')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Create Data Link'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        `Error creating data link: 500 Internal Server Error:
Could not create data link`
      );
    });
  });
});
