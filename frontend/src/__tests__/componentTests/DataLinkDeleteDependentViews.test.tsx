import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// DataLinkDialog reads several contexts for the create branch; stub them so the
// delete branch renders standalone.
vi.mock('@/contexts/FileBrowserContext', () => ({
  useFileBrowserContext: () => ({ fspName: 'f', filePath: '/a' })
}));
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({
    pathPreference: ['linux_path'],
    areDataLinksAutomatic: false,
    dataLinkSubpathMode: 'name'
  })
}));
vi.mock('@/contexts/ZonesAndFspMapContext', () => ({
  useZoneAndFspMapContext: () => ({
    zonesAndFspQuery: { isSuccess: false, data: {} }
  })
}));

const viewsForDataLink = vi.hoisted(() => vi.fn());
vi.mock('@/queries/viewQueries', async importOriginal => ({
  ...(await importOriginal<typeof import('@/queries/viewQueries')>()),
  useViewsForDataLinkQuery: viewsForDataLink
}));

import DataLinkDialog from '@/components/ui/Dialogs/DataLink';
import { DependentViewsError } from '@/queries/proxiedPathQueries';
import type { ProxiedPath } from '@/contexts/ProxiedPathContext';

const proxiedPath = {
  username: 'me',
  sharing_key: 'k1',
  sharing_name: 'n',
  path: '/a',
  fsp_name: 'f',
  created_at: '',
  updated_at: '',
  url: 'http://x',
  url_prefix: ''
} as ProxiedPath;

function renderDeleteDialog({
  handleDeleteDataLink
}: {
  handleDeleteDataLink: (
    proxiedPath: ProxiedPath,
    confirm?: boolean
  ) => Promise<void>;
}) {
  render(
    <DataLinkDialog
      action="delete"
      handleDeleteDataLink={handleDeleteDataLink}
      pending={false}
      proxiedPath={proxiedPath}
      setShowDataLinkDialog={vi.fn()}
      showDataLinkDialog={true}
    />
  );
}

describe('DataLinkDialog delete → dependent Views', () => {
  it('shows dependent Views as soon as the dialog opens and deletes with confirm on one click', async () => {
    viewsForDataLink.mockReturnValue({
      data: [{ short_key: 'v1', name: 'My overlay' }],
      isPending: false
    });
    const handleDeleteDataLink = vi.fn().mockResolvedValue(undefined);
    renderDeleteDialog({ handleDeleteDataLink });
    expect(await screen.findByText('My overlay')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(handleDeleteDataLink).toHaveBeenCalledWith(expect.anything(), true);
    expect(screen.queryByText('Delete anyway')).not.toBeInTheDocument();
  });

  it('deletes without confirm when there are no dependent Views', async () => {
    viewsForDataLink.mockReturnValue({ data: [], isPending: false });
    const handleDeleteDataLink = vi.fn().mockResolvedValue(undefined);
    renderDeleteDialog({ handleDeleteDataLink });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(handleDeleteDataLink).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('falls back to the 409 response when a View is created between fetch and click', async () => {
    const user = userEvent.setup();
    viewsForDataLink.mockReturnValue({ data: [], isPending: false });
    const handleDeleteDataLink = vi
      .fn()
      .mockRejectedValueOnce(
        new DependentViewsError('backs your Views', [
          { short_key: 'v1', name: 'My View' }
        ])
      )
      .mockResolvedValueOnce(undefined);

    renderDeleteDialog({ handleDeleteDataLink });

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(handleDeleteDataLink).toHaveBeenNthCalledWith(1, proxiedPath, false);
    // confirm sub-view now lists the View
    expect(await screen.findByText('My View')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(handleDeleteDataLink).toHaveBeenNthCalledWith(2, proxiedPath, true);
  });
});
