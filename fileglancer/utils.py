import re
from datetime import datetime, timezone
from mimetypes import guess_type

def slugify_path(s):
    """Slugify a path to make it into a name"""
    # Replace any special characters with underscores
    s = re.sub(r'[^a-zA-Z0-9]', '_', s)
    # Replace multiple underscores with a single underscore
    s = re.sub(r'_+', '_', s)
    # Remove leading underscores
    s = s.lstrip('_')
    return s


def format_timestamp(timestamp):
    """Format the given timestamp to ISO date format compatible with HTTP."""
    dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    return dt.isoformat()


def guess_content_type(filename):
    """A wrapper for guess_type which deals with unknown MIME types"""
    content_type, _ = guess_type(filename)
    if content_type:
        return content_type
    else:
        if filename.endswith('.yaml'):
            return 'text/plain+yaml'
        else:
            return 'application/octet-stream'


def parse_range_header(range_header: str, file_size: int):
    """Parse HTTP Range header and return start and end byte positions."""
    if not range_header or not range_header.startswith('bytes='):
        return None

    try:
        range_spec = range_header[6:]  # Remove 'bytes=' prefix

        if ',' in range_spec:
            range_spec = range_spec.split(',')[0].strip()

        if '-' not in range_spec:
            return None

        start_str, end_str = range_spec.split('-', 1)

        if start_str and end_str:
            start = int(start_str)
            end = int(end_str)
        elif start_str and not end_str:
            start = int(start_str)
            end = file_size - 1
        elif not start_str and end_str:
            suffix_length = int(end_str)
            start = max(0, file_size - suffix_length)
            end = file_size - 1
        else:
            return None

        if start < 0 or end < 0 or start >= file_size or start > end:
            return None

        end = min(end, file_size - 1)
        return (start, end)

    except (ValueError, IndexError):
        return None