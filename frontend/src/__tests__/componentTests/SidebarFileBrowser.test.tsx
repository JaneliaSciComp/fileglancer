import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';

import type { FileOrFolder } from '@/shared.types';
import type { FileSelectorLocation } from '@/hooks/useFileSelector';

const addToCart = vi.fn();
const navigateToLocation = vi.fn();
const handleItemDoubleClick = vi.fn();
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
    navigateToRawPath: vi.fn(),
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
vi.mock('@/contexts/CartContext', () => ({
  useCartContext: () => ({ addToCart })
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

beforeEach(() => {
  addToCart.mockReset().mockResolvedValue(undefined);
  navigateToLocation.mockReset();
  handleItemDoubleClick.mockReset();
  fetchNextPage.mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
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
  it('adds checked items to the cart and clears the checks', async () => {
    const user = userEvent.setup();
    render(<SidebarFileBrowser />);
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Select a.zarr' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select b.n5' }));
    await user.click(screen.getByRole('button', { name: 'Add 2 to cart' }));

    expect(addToCart).toHaveBeenCalledWith([
      { fsp_name: 'myFsp', path: 'data/a.zarr', label: 'a.zarr' },
      { fsp_name: 'myFsp', path: 'data/b.n5', label: 'b.n5' }
    ]);
    expect(toast.success).toHaveBeenCalledWith('Added 2 items to the cart');
    expect(
      screen.getByRole('checkbox', { name: 'Select a.zarr' })
    ).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
  });

  it('checks an item by clicking its row', async () => {
    const user = userEvent.setup();
    render(<SidebarFileBrowser />);
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

  it('says "item" when one item is added', async () => {
    const user = userEvent.setup();
    render(<SidebarFileBrowser />);

    await user.click(screen.getByRole('checkbox', { name: 'Select a.zarr' }));
    await user.click(screen.getByRole('button', { name: 'Add 1 to cart' }));

    expect(toast.success).toHaveBeenCalledWith('Added 1 item to the cart');
  });

  it('keeps the checks when adding to the cart fails', async () => {
    addToCart.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<SidebarFileBrowser />);
    await user.click(screen.getByRole('checkbox', { name: 'Select a.zarr' }));
    await user.click(screen.getByRole('button', { name: 'Add 1 to cart' }));

    expect(toast.error).toHaveBeenCalledWith(
      'Error adding items to the cart: boom'
    );
    expect(
      screen.getByRole('checkbox', { name: 'Select a.zarr' })
    ).toBeChecked();
  });

  it('opens a folder on double-click', async () => {
    const user = userEvent.setup();
    render(<SidebarFileBrowser />);
    await user.dblClick(screen.getByText('a.zarr'));
    expect(handleItemDoubleClick).toHaveBeenCalledWith(fake.items[0]);
  });

  it('does not open a folder when its checkbox is double-clicked', async () => {
    const user = userEvent.setup();
    render(<SidebarFileBrowser />);
    await user.dblClick(
      screen.getByRole('checkbox', { name: 'Select a.zarr' })
    );
    expect(handleItemDoubleClick).not.toHaveBeenCalled();
  });

  it('does not open a plain file', async () => {
    const user = userEvent.setup();
    render(<SidebarFileBrowser />);
    await user.dblClick(screen.getByText('notes.txt'));
    expect(handleItemDoubleClick).not.toHaveBeenCalled();
  });

  it('clears the checks when the folder changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SidebarFileBrowser />);
    await user.click(screen.getByRole('checkbox', { name: 'Select a.zarr' }));
    expect(screen.getByRole('button', { name: 'Add 1 to cart' })).toBeEnabled();

    fake.location = { type: 'filesystem', fspName: 'myFsp', path: 'data' };
    rerender(<SidebarFileBrowser />);
    expect(screen.getByRole('button', { name: 'Add to cart' })).toBeDisabled();
  });

  it('navigates by breadcrumb', async () => {
    const user = userEvent.setup();
    render(<SidebarFileBrowser />);
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
    render(<SidebarFileBrowser />);
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
    render(<SidebarFileBrowser />);
    await user.dblClick(screen.getByText('dangling'));
    expect(navigateToLocation).not.toHaveBeenCalled();
    expect(handleItemDoubleClick).not.toHaveBeenCalled();
  });

  it('shows no checkboxes above the folder level', async () => {
    fake.location = { type: 'zones' };
    fake.items = [file('ZoneA', { path: 'ZoneA', is_dir: true })];
    const user = userEvent.setup();
    render(<SidebarFileBrowser />);

    expect(screen.queryByRole('checkbox')).toBeNull();
    await user.dblClick(screen.getByText('ZoneA'));
    expect(handleItemDoubleClick).toHaveBeenCalledWith(fake.items[0]);
  });

  it('has no path field', () => {
    render(<SidebarFileBrowser />);
    expect(
      screen.queryByPlaceholderText('Type or paste a path to navigate ...')
    ).toBeNull();
  });

  it('loads the next page of a large folder', async () => {
    fake.fileQuery.hasNextPage = true;
    const user = userEvent.setup();
    render(<SidebarFileBrowser />);
    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('shows why a folder cannot be listed', () => {
    fake.items = [];
    fake.fileQuery.isError = true;
    fake.fileQuery.error = new Error(
      'You do not have permission to list this folder.'
    );
    render(<SidebarFileBrowser />);
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
    render(<SidebarFileBrowser />);
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
    render(<SidebarFileBrowser />);
    expect(screen.getByText('Next page failed')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select a.zarr' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Load more' })
    ).toBeInTheDocument();
  });
});
