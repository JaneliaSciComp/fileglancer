import zipfile
import pytest
from fileglancer.zipread import ZipReader

@pytest.fixture
def sample_zip(tmp_path):
    zip_path = tmp_path / "test.zip"
    with zipfile.ZipFile(zip_path, 'w') as zf:
        zf.writestr("file1.txt", "content1")
        zf.writestr("file2.txt", "content2")
        zf.writestr("file3.txt", "content3")
        zf.writestr("file4.txt", "content4")
    return str(zip_path)

def test_resume_parsing(sample_zip):
    with ZipReader(sample_zip) as reader:
        # Read first 2 entries
        entries = reader.parse_central_directory(max_new_entries=2)
        assert len(entries) == 2
        assert "file1.txt" in entries
        assert "file2.txt" in entries
        assert "file3.txt" not in entries

        # Read next 1 entry
        entries = reader.parse_central_directory(max_new_entries=1)
        assert len(entries) == 3
        assert "file3.txt" in entries

        # Read rest
        entries = reader.parse_central_directory()
        assert len(entries) == 4
        assert "file4.txt" in entries

        # Check parsed flag
        assert reader._cd_parsed

def test_lazy_get_entry(sample_zip):
    with ZipReader(sample_zip) as reader:
        # We haven't parsed anything yet
        assert len(reader._entries) == 0

        # Request file3.txt
        entry = reader.get_entry("file3.txt")
        assert entry is not None
        assert entry.filename == "file3.txt"

        # It should have parsed at least 3 entries
        assert len(reader._entries) >= 3
        assert "file1.txt" in reader._entries

        # file4 shouldn't be parsed yet
        assert "file4.txt" not in reader._entries
        assert not reader._cd_parsed

def test_resume_with_stop_condition(sample_zip):
    with ZipReader(sample_zip) as reader:
        # Stop at file2
        def stop_at_2(entry, idx):
            return entry.filename == "file2.txt"

        entries = reader.parse_central_directory(stop_condition=stop_at_2)
        assert "file2.txt" in entries
        assert "file3.txt" not in entries

        # Resume and stop at file3
        def stop_at_3(entry, idx):
            return entry.filename == "file3.txt"

        entries = reader.parse_central_directory(stop_condition=stop_at_3)
        assert "file3.txt" in entries
        assert "file4.txt" not in entries
