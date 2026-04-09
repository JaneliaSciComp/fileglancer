import os
import pytest
import tempfile
import shutil

from fileglancer.filestore import Filestore
from fileglancer.model import FileSharePath


@pytest.fixture
def pagination_dir():
    """Create a temp directory with enough files to test pagination."""
    temp_dir = tempfile.mkdtemp()
    chroot = os.path.join(temp_dir, "chroot")
    os.makedirs(chroot)

    # Create directories (sorted first)
    for i in range(3):
        os.makedirs(os.path.join(chroot, f"dir_{i:02d}"))

    # Create files
    for i in range(10):
        with open(os.path.join(chroot, f"file_{i:02d}.txt"), "w") as f:
            f.write(f"content {i}")

    yield chroot
    shutil.rmtree(temp_dir)


@pytest.fixture
def pagination_store(pagination_dir):
    fsp = FileSharePath(zone="test", name="test", mount_path=pagination_dir)
    return Filestore(fsp)


class TestPaginatedListing:

    def test_first_page(self, pagination_store):
        """First page returns correct number of items with has_more=True."""
        infos, has_more, next_cursor, total_count = (
            pagination_store.yield_file_infos_paginated(None, limit=5)
        )
        assert len(infos) == 5
        assert has_more is True
        assert next_cursor is not None
        assert total_count == 13  # 3 dirs + 10 files

    def test_full_listing_no_pagination(self, pagination_store):
        """When limit >= total entries, has_more is False and next_cursor is None."""
        infos, has_more, next_cursor, total_count = (
            pagination_store.yield_file_infos_paginated(None, limit=100)
        )
        assert len(infos) == 13
        assert has_more is False
        assert next_cursor is None
        assert total_count == 13

    def test_cursor_continuation(self, pagination_store):
        """Cursor returns the next page starting after the cursor entry."""
        infos1, _, cursor1, _ = pagination_store.yield_file_infos_paginated(
            None, limit=5
        )
        infos2, has_more2, cursor2, total2 = (
            pagination_store.yield_file_infos_paginated(None, limit=5, cursor=cursor1)
        )

        # Second page should not overlap with first
        names1 = {fi.name for fi in infos1}
        names2 = {fi.name for fi in infos2}
        assert names1.isdisjoint(names2)
        assert len(infos2) == 5
        assert has_more2 is True
        assert total2 == 13

    def test_all_pages_cover_all_entries(self, pagination_store):
        """Iterating through all pages returns every entry exactly once."""
        all_names = []
        cursor = None
        while True:
            infos, has_more, cursor, _ = (
                pagination_store.yield_file_infos_paginated(None, limit=4, cursor=cursor)
            )
            all_names.extend(fi.name for fi in infos)
            if not has_more:
                break

        assert len(all_names) == 13
        assert len(set(all_names)) == 13  # no duplicates

    def test_dirs_sorted_before_files(self, pagination_store):
        """Directories appear before files in the listing."""
        infos, _, _, _ = pagination_store.yield_file_infos_paginated(
            None, limit=100
        )
        dir_indices = [i for i, fi in enumerate(infos) if fi.is_dir]
        file_indices = [i for i, fi in enumerate(infos) if not fi.is_dir]
        assert max(dir_indices) < min(file_indices)

    def test_alphabetical_within_type(self, pagination_store):
        """Names are sorted alphabetically within dirs and within files."""
        infos, _, _, _ = pagination_store.yield_file_infos_paginated(
            None, limit=100
        )
        dir_names = [fi.name for fi in infos if fi.is_dir]
        file_names = [fi.name for fi in infos if not fi.is_dir]
        assert dir_names == sorted(dir_names)
        assert file_names == sorted(file_names)

    def test_deleted_cursor_fallback(self, pagination_dir, pagination_store):
        """When cursor entry no longer exists, listing starts from the beginning."""
        infos, has_more, _, total = (
            pagination_store.yield_file_infos_paginated(
                None, limit=5, cursor="nonexistent_file"
            )
        )
        # Falls back to beginning
        assert len(infos) == 5
        assert has_more is True
        assert total == 13
        # First entry should be the first dir (sorted first)
        assert infos[0].name == "dir_00"

    def test_last_page_boundary(self, pagination_store):
        """Last page has has_more=False and next_cursor=None."""
        # Get first 10 entries
        _, _, cursor, _ = pagination_store.yield_file_infos_paginated(
            None, limit=10
        )
        # Get remaining 3
        infos, has_more, next_cursor, _ = (
            pagination_store.yield_file_infos_paginated(None, limit=10, cursor=cursor)
        )
        assert len(infos) == 3
        assert has_more is False
        assert next_cursor is None

    def test_exact_limit_boundary(self, pagination_store):
        """When entries remaining == limit, has_more is False."""
        # 13 total, get first 10, then exactly 3 remain
        _, _, cursor, _ = pagination_store.yield_file_infos_paginated(
            None, limit=10
        )
        infos, has_more, next_cursor, _ = (
            pagination_store.yield_file_infos_paginated(None, limit=3, cursor=cursor)
        )
        assert len(infos) == 3
        assert has_more is False
        assert next_cursor is None

    def test_limit_one(self, pagination_store):
        """Pagination works with limit=1."""
        infos, has_more, cursor, total = (
            pagination_store.yield_file_infos_paginated(None, limit=1)
        )
        assert len(infos) == 1
        assert has_more is True
        assert cursor == infos[0].name
        assert total == 13

    def test_empty_directory(self):
        """Paginated listing of an empty directory."""
        temp_dir = tempfile.mkdtemp()
        try:
            fsp = FileSharePath(zone="test", name="test", mount_path=temp_dir)
            store = Filestore(fsp)
            infos, has_more, next_cursor, total = (
                store.yield_file_infos_paginated(None, limit=10)
            )
            assert infos == []
            assert has_more is False
            assert next_cursor is None
            assert total == 0
        finally:
            shutil.rmtree(temp_dir)

    def test_subdir_pagination(self, pagination_dir, pagination_store):
        """Pagination works for a subdirectory path."""
        # Add files to a subdir
        subdir = os.path.join(pagination_dir, "dir_00")
        for i in range(5):
            with open(os.path.join(subdir, f"sub_{i}.txt"), "w") as f:
                f.write(f"sub {i}")

        infos, has_more, _, total = (
            pagination_store.yield_file_infos_paginated("dir_00", limit=3)
        )
        assert len(infos) == 3
        assert has_more is True
        assert total == 5

    def test_chroot_escape_raises(self, pagination_store):
        """Attempting to escape root raises ValueError."""
        with pytest.raises(ValueError):
            pagination_store.yield_file_infos_paginated("../")

    def test_nonexistent_path_raises(self, pagination_store):
        """Listing a nonexistent path raises FileNotFoundError."""
        with pytest.raises((FileNotFoundError, PermissionError)):
            pagination_store.yield_file_infos_paginated("nonexistent")
