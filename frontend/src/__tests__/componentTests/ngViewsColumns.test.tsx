import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import {
  useReactTable,
  getCoreRowModel,
  flexRender
} from '@tanstack/react-table';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router', async importOriginal => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navigate };
});
vi.mock('@/utils/copyText', () => ({
  copyToClipboard: vi.fn().mockResolvedValue({ success: true })
}));

import {
  useNGViewsColumns,
  ActionsCell
} from '@/components/ui/Table/ngViewsColumns';
import type { View } from '@/queries/viewQueries';
import type { RemoveSourceTarget } from '@/components/ui/Table/ngViewsColumns';
import type { RelinkTarget } from '@/components/ui/Dialogs/RelinkDialog';
import { formatDateString } from '@/utils';

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({ pathPreference: ['linux_path'] })
}));
vi.mock('@/contexts/ZonesAndFspMapContext', () => ({
  useZoneAndFspMapContext: () => ({
    zonesAndFspQuery: {
      // key format is `fsp_<name>` (see makeMapKey)
      data: {
        fsp_nrs: {
          zone: 'z',
          name: 'nrs',
          group: '',
          storage: '',
          mount_path: '/nrs',
          linux_path: '/nrs',
          mac_path: null,
          windows_path: null
        }
      }
    }
  })
}));

const view: View = {
  short_key: 'k1',
  read_key: 'r1',
  name: 'My View',
  ng_state: { foo: 'bar' },
  sharing_mode: 'read',
  owner: 'me',
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-02T00:00:00Z',
  layers: [
    {
      layer_index: 0,
      data_link_id: 1,
      channel: null,
      opts: null,
      broken: false,
      fsp_name: 'nrs',
      path: 'dudman/one.zarr',
      sharing_key: null,
      url_prefix: null
    },
    {
      layer_index: 1,
      data_link_id: null,
      channel: null,
      opts: null,
      broken: true,
      fsp_name: 'nrs',
      path: 'dudman/two.zarr',
      sharing_key: null,
      url_prefix: null
    }
  ]
};

function TableProbe({
  onRename,
  onDelete,
  onRelink = () => {},
  onRemoveSource = () => {},
  onRemoveDatasets = () => {},
  view: viewProp = view
}: {
  onRename: (v: View) => void;
  onDelete: (v: View) => void;
  onRelink?: (t: RelinkTarget) => void;
  onRemoveSource?: (t: RemoveSourceTarget) => void;
  onRemoveDatasets?: (v: View) => void;
  view?: View;
}) {
  // ponytail: TableProbe is already a component, so call the hook directly
  // rather than nesting renderHook inside a component under render().
  const columns = useNGViewsColumns(
    onRename,
    onDelete,
    320,
    () => {},
    onRelink,
    onRemoveSource,
    onRemoveDatasets
  );
  const table = useReactTable({
    data: [viewProp],
    columns,
    getCoreRowModel: getCoreRowModel()
  });
  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map(row => (
          <tr key={row.id}>
            {row.getVisibleCells().map(cell => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

describe('useNGViewsColumns', () => {
  it('renders name, dataset count and updated date', () => {
    render(
      <MemoryRouter>
        <TableProbe onDelete={vi.fn()} onRename={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('My View')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // dataset count
    expect(
      screen.getByText(formatDateString(view.updated_at))
    ).toBeInTheDocument(); // updated date
  });

  it('counts per-channel layers of one dataset as one dataset', () => {
    const channelView: View = {
      ...view,
      layers: [0, 1, 2].map(i => ({ ...view.layers[0], layer_index: i }))
    };
    render(
      <MemoryRouter>
        <TableProbe onDelete={vi.fn()} onRename={vi.fn()} view={channelView} />
      </MemoryRouter>
    );
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders a browse link per layer source', () => {
    render(
      <MemoryRouter>
        <TableProbe onDelete={vi.fn()} onRename={vi.fn()} />
      </MemoryRouter>
    );
    // Sources come straight from each layer's fsp_name/path, displayed with
    // the FSP's mount path prefixed (see zonesAndFspQuery mock: nrs -> /nrs).
    const link = screen.getByText('/nrs/dudman/one.zarr');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href');
    expect(screen.getByText('/nrs/dudman/two.zarr')).toBeInTheDocument();
  });

  it('keeps the path and shows a broken-link icon for layers whose Data Link is gone', () => {
    render(
      <MemoryRouter>
        <TableProbe onDelete={vi.fn()} onRename={vi.fn()} />
      </MemoryRouter>
    );
    const brokenLink = screen.getByRole('link', { name: /two\.zarr/ });
    expect(brokenLink).toHaveAttribute(
      'href',
      expect.stringContaining('two.zarr')
    );
    expect(screen.getByLabelText('Data link missing')).toBeInTheDocument();
    // the intact source has no broken icon
    expect(screen.getAllByLabelText('Data link missing')).toHaveLength(1);
  });

  it('merges broken state across layers sharing one source', () => {
    const mixedBrokenView: View = {
      ...view,
      layers: [
        {
          layer_index: 0,
          data_link_id: 1,
          channel: 'ch0',
          opts: null,
          broken: false,
          fsp_name: 'nrs',
          path: 'dudman/shared.zarr',
          sharing_key: null,
          url_prefix: null
        },
        {
          layer_index: 1,
          data_link_id: null,
          channel: 'ch1',
          opts: null,
          broken: true,
          fsp_name: 'nrs',
          path: 'dudman/shared.zarr',
          sharing_key: null,
          url_prefix: null
        }
      ]
    };
    render(
      <MemoryRouter>
        <TableProbe
          onDelete={vi.fn()}
          onRename={vi.fn()}
          view={mixedBrokenView}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('link', { name: /shared\.zarr/ })).toHaveLength(
      1
    );
    expect(screen.getByLabelText('Data link missing')).toBeInTheDocument();
  });

  it('shows an em dash and no links when no layer has a resolvable source', () => {
    const noSourceView: View = {
      ...view,
      layers: [
        {
          layer_index: 0,
          data_link_id: null,
          channel: null,
          opts: null,
          broken: true,
          fsp_name: null,
          path: null,
          sharing_key: null,
          url_prefix: null
        }
      ]
    };
    render(
      <MemoryRouter>
        <TableProbe onDelete={vi.fn()} onRename={vi.fn()} view={noSourceView} />
      </MemoryRouter>
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /zarr/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Data link missing')
    ).not.toBeInTheDocument();
  });

  it('renders a link to the FSP root and the broken icon for an empty path', () => {
    // Empty string path means a Data Link at the FSP root (backend normalizes
    // "." to ""), which is a known source and must not be treated like null.
    const rootPathView: View = {
      ...view,
      layers: [
        {
          layer_index: 0,
          data_link_id: null,
          channel: null,
          opts: null,
          broken: true,
          fsp_name: 'nrs',
          path: '',
          sharing_key: null,
          url_prefix: null
        }
      ]
    };
    render(
      <MemoryRouter>
        <TableProbe onDelete={vi.fn()} onRename={vi.fn()} view={rootPathView} />
      </MemoryRouter>
    );
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    const link = screen.getByText('/nrs');
    expect(link.closest('a')).toHaveAttribute('href', '/browse/nrs');
    expect(screen.getByLabelText('Data link missing')).toBeInTheDocument();
  });

  it('lists an unsupported source with a remove button and excludes it from the dataset count', async () => {
    const unsupportedView: View = {
      ...view,
      layers: [
        view.layers[0],
        {
          layer_index: 1,
          data_link_id: 2,
          channel: null,
          opts: { unsupported: true },
          broken: false,
          fsp_name: 'nrs',
          path: 'dudman/plain-dir',
          sharing_key: null,
          url_prefix: null
        }
      ]
    };
    const onRemoveSource = vi.fn();
    render(
      <MemoryRouter>
        <TableProbe
          onDelete={vi.fn()}
          onRemoveSource={onRemoveSource}
          onRename={vi.fn()}
          view={unsupportedView}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('1')).toBeInTheDocument(); // dataset count
    expect(screen.getByRole('link', { name: /plain-dir/ })).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Data link missing')
    ).not.toBeInTheDocument();

    await userEvent.setup().click(
      screen.getByRole('button', {
        name: 'Remove /nrs/dudman/plain-dir from View'
      })
    );
    expect(onRemoveSource).toHaveBeenCalledWith({
      view: unsupportedView,
      fsp_name: 'nrs',
      path: 'dudman/plain-dir',
      displayPath: '/nrs/dudman/plain-dir'
    });
  });

  it('fires onRename, onRemoveDatasets and onDelete from the actions menu', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const onRemoveDatasets = vi.fn();
    render(
      <MemoryRouter>
        <TableProbe
          onDelete={onDelete}
          onRemoveDatasets={onRemoveDatasets}
          onRename={onRename}
        />
      </MemoryRouter>
    );
    const trigger = screen.getByRole('button'); // the CardActionsMenu trigger

    await user.click(trigger);
    await user.click(await screen.findByText('Rename'));
    expect(onRename).toHaveBeenCalledWith(view);

    await user.click(trigger);
    await user.click(await screen.findByText('Remove datasets'));
    expect(onRemoveDatasets).toHaveBeenCalledWith(view);

    await user.click(trigger);
    await user.click(await screen.findByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith(view);
  });

  it('navigates to the embedded viewer when "Open View" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ActionsCell
        item={view}
        onDelete={vi.fn()}
        onRemoveDatasets={vi.fn()}
        onRename={vi.fn()}
      />
    );
    const trigger = screen.getByRole('button');

    await user.click(trigger);
    await user.click(await screen.findByText('Open View'));
    expect(navigate).toHaveBeenCalledWith(`/view/${view.read_key}`);
  });

  it('copies the short View link under "Copy View link to share" and toasts "View link copied"', async () => {
    const user = userEvent.setup();
    const { copyToClipboard } = await import('@/utils/copyText');
    render(
      <MemoryRouter>
        <TableProbe onDelete={vi.fn()} onRename={vi.fn()} />
      </MemoryRouter>
    );
    const trigger = screen.getByRole('button');

    await user.click(trigger);
    await user.click(await screen.findByText('Copy View link to share'));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('View link copied')
    );
    expect(copyToClipboard).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`/view/${view.read_key}$`))
    );
  });
});

function renderTable(v: View, onRelink = vi.fn()) {
  render(
    <MemoryRouter>
      <TableProbe
        onDelete={vi.fn()}
        onRelink={onRelink}
        onRename={vi.fn()}
        view={v}
      />
    </MemoryRouter>
  );
}

describe('useNGViewsColumns relink', () => {
  it('renders a Relink button for a relinkable broken source', async () => {
    const onRelink = vi.fn();
    const relinkable: View = {
      ...view,
      layers: [
        { ...view.layers[1], sharing_key: 'dead', url_prefix: 'two.zarr' }
      ]
    };
    renderTable(relinkable, onRelink);
    await userEvent
      .setup()
      .click(
        screen.getByRole('button', { name: 'Relink /nrs/dudman/two.zarr' })
      );
    expect(onRelink).toHaveBeenCalledWith({
      fsp_name: 'nrs',
      path: 'dudman/two.zarr',
      displayPath: '/nrs/dudman/two.zarr'
    });
  });

  it('treats a source as relinkable if any of its broken layers is', () => {
    const mixed: View = {
      ...view,
      layers: [
        { ...view.layers[1], layer_index: 0 },
        {
          ...view.layers[1],
          layer_index: 1,
          sharing_key: 'dead',
          url_prefix: 'two.zarr'
        }
      ]
    };
    renderTable(mixed);
    expect(
      screen.getByRole('button', { name: 'Relink /nrs/dudman/two.zarr' })
    ).toBeInTheDocument();
  });

  it('keeps a plain icon for an unrecoverable broken source', () => {
    renderTable(view); // view.layers[1]: broken, no key
    expect(
      screen.queryByRole('button', { name: /^Relink / })
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByLabelText("Can't relink — recreate this View").length
    ).toBeGreaterThan(0);
  });
});
