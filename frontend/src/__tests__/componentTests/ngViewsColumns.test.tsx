import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import userEvent from '@testing-library/user-event';
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

import {
  useNGViewsColumns,
  ActionsCell
} from '@/components/ui/Table/ngViewsColumns';
import type { View } from '@/queries/viewQueries';
import { formatDateString } from '@/utils';

vi.mock('@/queries/proxiedPathQueries', () => ({
  useAllProxiedPathsQuery: () => ({
    data: [
      { id: 1, fsp_name: 'nrs', path: 'dudman/reg.zarr/g1_r0' },
      { id: 2, fsp_name: 'nrs', path: 'dudman/reg.zarr/g1_r1' }
    ]
  })
}));
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
      broken: false
    },
    {
      layer_index: 1,
      data_link_id: 2,
      channel: 'ch0',
      opts: null,
      broken: false
    }
  ]
};

function TableProbe({
  onRename,
  onDelete
}: {
  onRename: (v: View) => void;
  onDelete: (v: View) => void;
}) {
  // ponytail: TableProbe is already a component, so call the hook directly
  // rather than nesting renderHook inside a component under render().
  const columns = useNGViewsColumns(
    onRename,
    onDelete,
    'https://ng.example/',
    320,
    () => {}
  );
  const table = useReactTable({
    data: [view],
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
  it('renders name, layer count, sharing label and updated date', () => {
    render(
      <MemoryRouter>
        <TableProbe onDelete={vi.fn()} onRename={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByText('My View')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // layer count
    expect(screen.getByText(/shared/i)).toBeInTheDocument(); // sharing label
    expect(
      screen.getByText(formatDateString(view.updated_at))
    ).toBeInTheDocument(); // updated date
  });

  it('renders a browse link per layer source', () => {
    render(
      <MemoryRouter>
        <TableProbe onDelete={vi.fn()} onRename={vi.fn()} />
      </MemoryRouter>
    );
    // Sources show the full path (file share path + subpath), not just the subpath.
    const link = screen.getByText('/nrs/dudman/reg.zarr/g1_r0');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href');
    expect(screen.getByText('/nrs/dudman/reg.zarr/g1_r1')).toBeInTheDocument();
  });

  it('fires onRename and onDelete from the actions menu', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(
      <MemoryRouter>
        <TableProbe onDelete={onDelete} onRename={onRename} />
      </MemoryRouter>
    );
    const trigger = screen.getByRole('button'); // the CardActionsMenu trigger

    await user.click(trigger);
    await user.click(await screen.findByText('Rename'));
    expect(onRename).toHaveBeenCalledWith(view);

    await user.click(trigger);
    await user.click(await screen.findByText('Delete'));
    expect(onDelete).toHaveBeenCalledWith(view);
  });

  it('navigates to the embedded viewer when "Open in Neuroglancer" is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ActionsCell
        baseUrl="https://ng.example/"
        item={view}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />
    );
    const trigger = screen.getByRole('button');

    await user.click(trigger);
    await user.click(await screen.findByText('Open in Neuroglancer'));
    expect(navigate).toHaveBeenCalledWith(`/view/${view.read_key}`);
  });
});
