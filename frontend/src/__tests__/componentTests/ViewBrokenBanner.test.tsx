import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

import type { ViewLayer } from '@/queries/viewQueries';

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({ pathPreference: ['linux_path'] })
}));
vi.mock('@/contexts/ZonesAndFspMapContext', () => ({
  useZoneAndFspMapContext: () => ({ zonesAndFspQuery: { data: {} } })
}));
vi.mock('@/components/ui/widgets/FgTooltip', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>
}));

import ViewBrokenBanner from '@/components/ui/Views/ViewBrokenBanner';

const layer = (over: Partial<ViewLayer>): ViewLayer => ({
  layer_index: 0,
  data_link_id: null,
  channel: null,
  opts: null,
  broken: true,
  fsp_name: 'fsp',
  path: 'a.zarr',
  sharing_key: 'k1',
  url_prefix: 'a.zarr',
  ...over
});

describe('ViewBrokenBanner', () => {
  it('renders nothing without relinkable layers', () => {
    const { container } = render(
      <ViewBrokenBanner
        disabled={false}
        layers={[
          layer({ broken: false }),
          layer({ sharing_key: null, path: 'b.zarr' })
        ]}
        onRelink={vi.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each broken dataset once and relinks it', async () => {
    const onRelink = vi.fn();
    render(
      <ViewBrokenBanner
        disabled={false}
        layers={[
          layer({ layer_index: 0, channel: 'c0' }),
          layer({ layer_index: 1, channel: 'c1' }),
          layer({ layer_index: 2, path: 'b.zarr', url_prefix: 'b.zarr' })
        ]}
        onRelink={onRelink}
      />
    );
    expect(screen.getByText('2 sources are broken')).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: /^Relink / });
    expect(buttons).toHaveLength(2);
    await userEvent.click(buttons[0]);
    expect(onRelink).toHaveBeenCalledWith(
      expect.objectContaining({ fsp_name: 'fsp', path: 'a.zarr' })
    );
  });

  it('disables Relink while there are unsaved changes', () => {
    render(
      <ViewBrokenBanner disabled layers={[layer({})]} onRelink={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: /^Relink / })).toBeDisabled();
  });
});
