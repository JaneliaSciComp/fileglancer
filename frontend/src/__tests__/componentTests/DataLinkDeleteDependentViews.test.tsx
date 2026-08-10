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

describe('DataLinkDialog delete → dependent Views', () => {
  it('lists dependent Views on 409 and confirms with confirm=true', async () => {
    const user = userEvent.setup();
    const handleDeleteDataLink = vi
      .fn()
      .mockRejectedValueOnce(
        new DependentViewsError('backs your Views', [
          { short_key: 'v1', name: 'My View' }
        ])
      )
      .mockResolvedValueOnce(undefined);

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

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(handleDeleteDataLink).toHaveBeenNthCalledWith(1, proxiedPath, false);
    // confirm sub-view now lists the View
    expect(await screen.findByText('My View')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /delete anyway/i }));
    expect(handleDeleteDataLink).toHaveBeenNthCalledWith(2, proxiedPath, true);
  });
});
