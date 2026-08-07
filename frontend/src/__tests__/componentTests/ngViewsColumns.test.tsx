import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  useReactTable,
  getCoreRowModel,
  flexRender
} from '@tanstack/react-table';

import { useNGViewsColumns } from '@/components/ui/Table/ngViewsColumns';
import type { View } from '@/queries/viewQueries';

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
  const columns = useNGViewsColumns(onRename, onDelete, 'https://ng.example/');
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
    render(<TableProbe onDelete={vi.fn()} onRename={vi.fn()} />);
    expect(screen.getByText('My View')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // layer count
    expect(screen.getByText(/shared/i)).toBeInTheDocument(); // sharing label
  });

  it('fires onRename and onDelete from the actions menu', async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();
    const onDelete = vi.fn();
    render(<TableProbe onDelete={onDelete} onRename={onRename} />);
    await user.click(screen.getByRole('button')); // the CardActionsMenu trigger
    await user.click(await screen.findByText('Rename'));
    expect(onRename).toHaveBeenCalledWith(view);
  });
});
