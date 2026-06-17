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
      expect(
        screen.getByText('Are you sure you want to create a data link?')
      ).toBeInTheDocument();
    });
  });

  it('calls toast.success for an ok HTTP response', async () => {
    const user = userEvent.setup();
    await user.click(screen.getByText('Create Data Link'));
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Data link created successfully'
      );
    });
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
    await user.click(screen.getByText('Create Data Link'));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        `Error creating data link: 500 Internal Server Error:
Could not create data link`
      );
    });
  });
});

describe('Data Link dialog at FSP root', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Render at the FSP root (no subpath). Filestore surfaces this as ".",
    // which the create flow normalizes to "" for the backend path. The default
    // subpath mode is "full_path", so the url_prefix is the FSP's linux path.
    render(<TestDataLinkComponent />, {
      initialEntries: ['/browse/test_fsp']
    });

    await waitFor(() => {
      expect(
        screen.getByText('Are you sure you want to create a data link?')
      ).toBeInTheDocument();
    });
  });

  it('previews the FSP linux path as the url_prefix', async () => {
    const user = userEvent.setup();

    // The preview lives inside the collapsed "Advanced settings" accordion.
    await user.click(screen.getByText('Advanced settings'));

    await waitFor(() => {
      expect(
        screen.getByText((content: string) =>
          content.includes('https://.../<key>/test/fsp')
        )
      ).toBeInTheDocument();
    });
  });

  it('submits the FSP linux path as the url_prefix for an FSP-root link', async () => {
    const { server } = await import('@/__tests__/mocks/node');
    const { http, HttpResponse } = await import('msw');

    let capturedUrlPrefix: string | null = null;
    let capturedPath: string | null = null;
    server.use(
      http.post('/api/proxied-path', ({ request }) => {
        const url = new URL(request.url);
        capturedUrlPrefix = url.searchParams.get('url_prefix');
        capturedPath = url.searchParams.get('path');
        return HttpResponse.json({
          username: 'testuser',
          sharing_key: 'testkey',
          sharing_name: 'test_fsp',
          path: capturedPath ?? '',
          fsp_name: 'test_fsp',
          created_at: '2025-07-08T15:56:42.588942',
          updated_at: '2025-07-08T15:56:42.588942',
          url: 'http://127.0.0.1:7878/files/testkey/' + capturedUrlPrefix,
          url_prefix: capturedUrlPrefix
        });
      })
    );

    const user = userEvent.setup();
    await user.click(screen.getByText('Create Data Link'));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Data link created successfully'
      );
    });
    // "." is normalized to "" for the backend path, while the default
    // "full_path" mode derives the url_prefix from the FSP's linux path.
    expect(capturedPath).toBe('');
    expect(capturedUrlPrefix).toBe('test/fsp');
  });
});
