import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { render, screen } from '@/__tests__/test-utils';
import toast from 'react-hot-toast';
import DataLinkDialog from '@/components/ui/Dialogs/DataLink';

describe('Data Link dialog', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const setShowDataLinkDialog = vi.fn();

    render(
      <DataLinkDialog
        action="create"
        showDataLinkDialog={true}
        setShowDataLinkDialog={setShowDataLinkDialog}
        proxiedPath={null}
      />,
      { initialEntries: ['/browse/test_fsp/my_folder/my_zarr'] }
    );

    await waitFor(() => {
      expect(screen.getByText('my_zarr', { exact: false })).toBeInTheDocument();
    });
  });

  it('calls toast.success for an ok HTTP response', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByText('Create Data Link'));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Successfully created data link for /test/fsp/my_folder/my_zarr'
      );
    });
  });

  it('calls toast.error for a bad HTTP response', async () => {
    // Override the mock for this specific test to simulate an error
    const { server } = await import('@/__tests__/mocks/node');
    const { http, HttpResponse } = await import('msw');

    server.use(
      http.post('http://localhost:3000/api/fileglancer/proxied-path', () => {
        return HttpResponse.json(
          { error: 'Could not create data link' },
          { status: 500 }
        );
      })
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('Create Data Link'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Error creating data link: Could not create data link'
      );
    });
  });
});
