import { describe, it, expect, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { render, screen } from '@/__tests__/test-utils';
import DataLinkUsageDialog from '@/components/ui/Dialogs/dataLinkUsage/DataLinkUsageDialog';

const DATA_LINK_URL = 'http://localhost:7878/files/testkey/my_image.tif';

function renderDialog() {
  return render(
    <DataLinkUsageDialog
      dataLinkUrl={DATA_LINK_URL}
      fspName="test_fsp"
      path="my_folder/my_image.tif"
      open={true}
      onClose={() => undefined}
    />,
    { initialEntries: ['/browse/test_fsp/my_folder/my_image.tif'] }
  );
}

function getTabLabels() {
  return screen.getAllByRole('tab').map(tab => tab.textContent);
}

describe('DataLinkUsageDialog — file target', () => {
  beforeEach(async () => {
    // Override the files handler to return a single file (is_dir: false)
    const { server } = await import('@/__tests__/mocks/node');
    server.use(
      http.get('/api/files/:fspName', ({ params, request }) => {
        const url = new URL(request.url);
        const subpath = url.searchParams.get('subpath');
        if (
          params.fspName === 'test_fsp' &&
          subpath === 'my_folder/my_image.tif'
        ) {
          return HttpResponse.json({
            info: {
              name: 'my_image.tif',
              path: subpath,
              size: 204800,
              is_dir: false,
              permissions: '-rw-r--r--',
              owner: 'testuser',
              group: 'testgroup',
              last_modified: 1647855213
            },
            files: []
          });
        }
        // Fall through to default for other paths
        return HttpResponse.json({
          info: {
            name: subpath ? subpath.split('/').pop() : '',
            path: subpath || '.',
            size: subpath ? 1024 : 0,
            is_dir: true,
            permissions: 'drwxr-xr-x',
            owner: 'testuser',
            group: 'testgroup',
            last_modified: 1647855213
          },
          files: []
        });
      })
    );
  });

  it('shows Browser, Download, and Python tabs for a file target', async () => {
    renderDialog();

    await waitFor(() => {
      const labels = getTabLabels();
      expect(labels).toContain('Browser');
      expect(labels).toContain('Download');
      expect(labels).toContain('Python');
    });
  });

  it('does not show Java, N5 Viewer, Napari, or VVDViewer tabs for a file target', async () => {
    renderDialog();

    await waitFor(() => {
      // Tabs should have resolved (skeleton gone, real tabs visible)
      expect(screen.getAllByRole('tab').length).toBeGreaterThan(0);
    });

    const labels = getTabLabels();
    expect(labels).not.toContain('Java');
    expect(labels).not.toContain('N5 Viewer');
    expect(labels).not.toContain('Napari');
    expect(labels).not.toContain('VVDViewer');
  });

  it('shows the data link URL in the dialog header', async () => {
    renderDialog();

    await waitFor(() => {
      expect(screen.getByText(DATA_LINK_URL)).toBeInTheDocument();
    });
  });

  it('shows curl and wget commands when the Download tab is active', async () => {
    const user = userEvent.setup();
    renderDialog();

    // Wait for tabs to resolve
    await waitFor(() => {
      expect(screen.getAllByRole('tab').length).toBeGreaterThan(0);
    });

    // Click the Download tab to make it active
    const downloadTab = screen.getByRole('tab', { name: 'Download' });
    await user.click(downloadTab);

    // Now the Download tab panel is active and its content is rendered
    await waitFor(() => {
      // SyntaxHighlighter may split text — match on the pre/code container's textContent
      const codeElements = document.querySelectorAll('pre, code');
      const hasCurl = Array.from(codeElements).some(el =>
        el.textContent?.includes('curl -O')
      );
      const hasWget = Array.from(codeElements).some(el =>
        el.textContent?.includes('wget')
      );
      expect(hasCurl).toBe(true);
      expect(hasWget).toBe(true);
    });
  });
});
