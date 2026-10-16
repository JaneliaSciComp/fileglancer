import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CartDimensionCheck } from '@/hooks/useCartDimensionCheck';
import type { CartItem } from '@/contexts/CartContext';
import type { FileOrFolder } from '@/shared.types';
import type { FileSelectorLocation } from '@/hooks/useFileSelector';

const addToView = vi.fn();
const startAddToView = vi.fn();
const dimensionCheck = vi.fn<(items: CartItem[]) => CartDimensionCheck>();
const navigateToLocation = vi.fn();
const handleItemDoubleClick = vi.fn();
const navigateToRawPath = vi.fn();
const fetchNextPage = vi.fn();

type FakeSelector = {
  location: FileSelectorLocation;
  items: FileOrFolder[];
  fileQuery: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => void;
    data?: unknown;
  };
  zonesQuery: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    data?: Record<string, unknown>;
  };
};
let fake: FakeSelector;

vi.mock('@/hooks/useFileSelector', () => ({
  default: () => ({
    state: { currentLocation: fake.location, selectedItem: null },
    displayItems: fake.items,
    fileQuery: fake.fileQuery,
    zonesQuery: fake.zonesQuery,
    navigateToLocation,
    navigateToRawPath,
    navigateHome: vi.fn(),
    canGoHome: true,
    currentPathDisplay: '',
    handleItemDoubleClick,
    searchQuery: '',
    handleSearchChange: vi.fn(),
    clearSearch: vi.fn(),
    isFilteredByGroups: false,
    userHasGroups: false,
    hideDotFiles: true,
    toggleHideDotFiles: vi.fn()
  })
}));
vi.mock('@/queries/fileQueries', () => ({
  useCreateFolderMutation: () => ({ isPending: false, mutateAsync: vi.fn() })
}));
vi.mock('@/hooks/useCartDimensionCheck', () => ({
  useCartDimensionCheck: (items: CartItem[]) => dimensionCheck(items)
}));
vi.mock('@/hooks/useCreateViewFlow', () => ({
  useCreateViewFlow: () => ({ startAddToView, dialog: null, pending: false })
}));
// A stable array, as the real context gives: a new one each render would
// rebuild the table's columns and remount its cells.
const pathPreference = ['linux_path'];
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferencesContext: () => ({ pathPreference })
}));
vi.mock('@/components/ui/FileSelector/FileSelectorBreadcrumbs', () => ({
  default: ({
    onNavigate
  }: {
    onNavigate: (l: FileSelectorLocation) => void;
  }) => (
    <button onClick={() => onNavigate({ type: 'zones' })} type="button">
      Zones
    </button>
  )
}));

import SidebarFileBrowser from '@/components/ui/Views/SidebarFileBrowser';

const file = (
  name: string,
  extra: Partial<FileOrFolder> = {}
): FileOrFolder => ({
  name,
  path: `data/${name}`,
  size: 0,
  is_dir: false,
  permissions: '',
  owner: '',
  group: '',
  last_modified: 0,
  ...extra
});

// Every checked dataset probed as OME, with matching dimensions.
const allOk = (items: CartItem[]): CartDimensionCheck => ({
  mismatchedKeys: new Set(),
  hasMismatch: false,
  kindByKey: new Map(items.map(i => [`${i.fsp_name}::${i.path}`, 'ome']))
});

const VIEW_SOURCES = [{ fsp_name: 'myFsp', path: 'data/first.zarr' }];
const Browser = () => (
  <SidebarFileBrowser addToView={addToView} viewSources={VIEW_SOURCES} />
);

beforeEach(() => {
  addToView.mockReset().mockResolvedValue(undefined);
  // The real flow asks first only for consent or a mismatch, and toasts a
  // failed add.
  startAddToView
    .mockReset()
    .mockImplementation(
      (items: CartItem[], _m: boolean, add: (i: CartItem[]) => Promise<void>) =>
        add(items).catch(() => {})
    );
  dimensionCheck.mockReset().mockImplementation(allOk);
  navigateToLocation.mockReset();
  handleItemDoubleClick.mockReset();
  navigateToRawPath.mockReset();
  fetchNextPage.mockReset();
  fake = {
    location: { type: 'filesystem', fspName: 'myFsp', path: 'data' },
    items: [
      file('a.zarr', { is_dir: true }),
      file('b.n5', { is_dir: true }),
      file('notes.txt')
    ],
    fileQuery: {
      isPending: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage
    },
    zonesQuery: { isPending: false, isError: false, error: null, data: {} }
  };
});

describe('SidebarFileBrowser', () => {
  it('adds checked items to the View and clears the checks', async () => {
    const user = userEvent.setup();
    render(<Browser />);
    expect(
      screen.getByRole('button', { name: 'Add to this View' })
    ).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Select a.zarr' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select b.n5' }));
    await user.click(
      screen.getByRole('button', { name: 'Add 2 to this View' })
    );

    const items = [
      { fsp_name: 'myFsp', path: 'data/a.zarr', label: 'a.zarr' },
      { fsp_name: 'myFsp', path: 'data/b.n5', label: 'b.n5' }
    ];
    expect(startAddToView).toHaveBeenCalledWith(
      items,
      false,
      expect.any(Function)
    );
    expect(addToView).toHaveBeenCalledWith(items);
    expect(
      screen.getByRole('checkbox', { name: 'Select a.zarr' })
    ).not.toBeChecked();
  });

  it('probes only the checked items', async () => {
    const user = userEvent.setup();
    render(<Browser />);
    expect(dimensionCheck).toHaveBeenLastCalledWith([]);
    await user.click(screen.getByRole('checkbox', { name: 'Select a.zarr' }));
    expect(dimensionCheck).toHaveBeenLastCalledWith([
      { fsp_name: 'myFsp', path: 'data/a.zarr', label: 'a.zarr' }
    ]);
  });

  it('waits for the checks before adding', async () => {
    dimensionCheck.mockImplementation(items => ({
      mismatchedKeys: new Set(),
      hasMismatch: false,
      kindByKey: new Map(items.map(i => [i.path, 'loading' as const]))
    }));
    const user = userEvent.setup();
    render(<Browser />);
    await user.click(screen.getByRole('checkbox', { name: 'Select a.zarr' }));
    expect(screen.getByText('Checking the dataset...')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add 1 to this View' })
    ).toBeDisabled();
  });

  it('warns about mismatched and unsupported datasets, and passes the mismatch on', async () => {
    dimensionCheck.mockImplementation(items => ({
      mismatchedKeys: new Set(items.length ? ['myFsp::data/a.zarr'] : []),
      hasMismatch: items.length > 0,
      kindByKey: new Map(
        items.map(i => [
          i.path,
          i.path.endsWith('.n5') ? ('unsupported' as const) : ('ome' as const)
        ])
      )
    }));
    const user = userEvent.setup();
    render(<Browser />);
    await user.click(screen.getByRole('checkbox', { name: 'Select a.zarr' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select b.n5' }));
    expect(
      screen.getByText(
        "1 dataset can't load as a Neuroglancer layer and will be listed as a source only."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 dataset has dimensions that differ from the first layer.'
      )
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Add 2 to this View' })
    );
    expect(startAddToView).toHaveBeenCalledWith(
      expect.any(Array),
      true,
      expect.any(Function)
    );
  });

  it('keeps the checks when adding fails', async () => {
    addToView.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<Browser />);
    await user.click(screen.getByRole('checkbox', { name: 'Select a.zarr' }));
    await user.click(
      screen.getByRole('button', { name: 'Add 1 to this View' })
    );
    expect(
      screen.getByRole('checkbox', { name: 'Select a.zarr' })
    ).toBeChecked();
  });

  it('checks an item by clicking its row', async () => {
    const user = userEvent.setup();
    render(<Browser />);
    // The name's tooltip repeats it once hovered.
    const name = () => screen.getByText('notes.txt', { selector: 'p' });
    await user.click(name());
    expect(
      screen.getByRole('checkbox', { name: 'Select notes.txt' })
    ).toBeChecked();
    await user.click(name());
    expect(
      screen.getByRole('checkbox', { name: 'Select notes.txt' })
    ).not.toBeChecked();
  });

  it('opens a folder on double-click', async () => {
    const user = userEvent.setup();
    render(<Browser />);
    await user.dblClick(screen.getByText('a.zarr'));
    expect(handleItemDoubleClick).toHaveBeenCalledWith(fake.items[0]);
  });

  it('does not open a folder when its checkbox is double-clicked', async () => {
    const user = userEvent.setup();
    render(<Browser />);
    await user.dblClick(
      screen.getByRole('checkbox', { name: 'Select a.zarr' })
    );
    expect(handleItemDoubleClick).not.toHaveBeenCalled();
  });

  it('does not open a plain file', async () => {
    const user = userEvent.setup();
    render(<Browser />);
    await user.dblClick(screen.getByText('notes.txt'));
    expect(handleItemDoubleClick).not.toHaveBeenCalled();
  });

  it('clears the checks when the folder changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Browser />);
    await user.click(screen.getByRole('checkbox', { name: 'Select a.zarr' }));
    expect(
      screen.getByRole('button', { name: 'Add 1 to this View' })
    ).toBeEnabled();

    fake.location = { type: 'filesystem', fspName: 'myFsp', path: 'data' };
    rerender(<Browser />);
    expect(
      screen.getByRole('button', { name: 'Add to this View' })
    ).toBeDisabled();
  });

  it('navigates by breadcrumb', async () => {
    const user = userEvent.setup();
    render(<Browser />);
    await user.click(screen.getByRole('button', { name: 'Zones' }));
    expect(navigateToLocation).toHaveBeenCalledWith({ type: 'zones' });
  });

  it('follows a symlink into its target file share', async () => {
    fake.items = [
      file('linked', {
        is_dir: true,
        is_symlink: true,
        symlink_target_fsp: { fsp_name: 'otherFsp', subpath: 'real/dir' }
      })
    ];
    const user = userEvent.setup();
    render(<Browser />);
    await user.dblClick(screen.getByText('linked'));

    expect(navigateToLocation).toHaveBeenCalledWith({
      type: 'filesystem',
      fspName: 'otherFsp',
      path: 'real/dir'
    });
    expect(handleItemDoubleClick).not.toHaveBeenCalled();
  });

  it('does not open a broken symlink', async () => {
    fake.items = [file('dangling', { is_dir: true, is_symlink: true })];
    const user = userEvent.setup();
    render(<Browser />);
    await user.dblClick(screen.getByText('dangling'));
    expect(navigateToLocation).not.toHaveBeenCalled();
    expect(handleItemDoubleClick).not.toHaveBeenCalled();
  });

  it('shows no checkboxes above the folder level', async () => {
    fake.location = { type: 'zones' };
    fake.items = [file('ZoneA', { path: 'ZoneA', is_dir: true })];
    const user = userEvent.setup();
    render(<Browser />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.dblClick(screen.getByText('ZoneA'));
    expect(handleItemDoubleClick).toHaveBeenCalledWith(fake.items[0]);
  });

  it('navigates to a typed path on Go', async () => {
    navigateToRawPath.mockReturnValue(true);
    const user = userEvent.setup();
    render(<Browser />);
    await user.type(
      screen.getByPlaceholderText('Type or paste a path to navigate ...'),
      '/groups/lab/data'
    );
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(navigateToRawPath).toHaveBeenCalledWith('/groups/lab/data');
  });

  it('loads the next page of a large folder', async () => {
    fake.fileQuery.hasNextPage = true;
    const user = userEvent.setup();
    render(<Browser />);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('shows why a folder cannot be listed', () => {
    fake.items = [];
    fake.fileQuery.isError = true;
    fake.fileQuery.error = new Error(
      'You do not have permission to list this folder.'
    );
    render(<Browser />);
    expect(
      screen.getByText('You do not have permission to list this folder.')
    ).toBeInTheDocument();
  });

  it('shows why the file shares cannot be loaded', () => {
    // useFileQuery stays disabled (pending) without zones data.
    fake.zonesQuery = {
      isPending: false,
      isError: true,
      error: new Error('Zones unavailable'),
      data: undefined
    };
    fake.items = [];
    fake.fileQuery.isPending = true;
    render(<Browser />);
    expect(
      screen.getByText('Error loading zones: Zones unavailable')
    ).toBeInTheDocument();
    expect(screen.queryByText('Loading files...')).toBeNull();
  });

  it('keeps the loaded list when loading the next page fails', () => {
    fake.fileQuery.isError = true;
    fake.fileQuery.error = new Error('Next page failed');
    fake.fileQuery.data = { pages: [] };
    fake.fileQuery.hasNextPage = true;
    render(<Browser />);
    expect(screen.getByText('Next page failed')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select a.zarr' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Load more' })
    ).toBeInTheDocument();
  });
});
