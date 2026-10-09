import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { View } from '@/queries/viewQueries';

const mutateAsync = vi.fn().mockResolvedValue({});
vi.mock('@/contexts/ViewsContext', () => ({
  useViewsContext: () => ({
    removeViewSourcesMutation: { mutateAsync, isPending: false }
  })
}));
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({ pathPreference: ['linux_path'] })
}));
vi.mock('@/contexts/ZonesAndFspMapContext', () => ({
  useZoneAndFspMapContext: () => ({ zonesAndFspQuery: { data: {} } })
}));

import RemoveDatasetsDialog from '@/components/ui/Dialogs/RemoveDatasetsDialog';

const layer = (layer_index: number, path: string) => ({
  layer_index,
  data_link_id: 1,
  channel: null,
  opts: null,
  broken: false,
  fsp_name: 'nrs',
  path,
  sharing_key: null,
  url_prefix: null
});

const view: View = {
  short_key: 'k1',
  read_key: 'r1',
  name: 'My View',
  ng_state: {},
  sharing_mode: 'read',
  owner: 'me',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
  // a.zarr split per channel: one dataset, two layers
  layers: [layer(0, 'a.zarr'), layer(1, 'b.zarr'), layer(2, 'a.zarr')]
};

describe('RemoveDatasetsDialog', () => {
  it('lists each dataset once and removes only the checked ones', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RemoveDatasetsDialog onClose={onClose} view={view} />);

    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    const remove = screen.getByRole('button', { name: 'Remove' });
    expect(remove).toBeDisabled();

    await user.click(screen.getByLabelText(/b\.zarr/));
    await user.click(remove);
    expect(mutateAsync).toHaveBeenCalledWith({
      short_key: 'k1',
      sources: [{ fsp_name: 'nrs', path: 'b.zarr' }]
    });
    expect(onClose).toHaveBeenCalled();
  });
});
