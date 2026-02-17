import re
from datetime import datetime, timezone
from mimetypes import guess_type

def slugify_path(s):
    """Slugify a path to make it into a name"""
    if s.startswith("~"):
        s = s.replace("~", "home_", 1)
    # Replace any special characters with underscores
    s = re.sub(r'[^a-zA-Z0-9]', '_', s)
    # Replace multiple underscores with a single underscore
    s = re.sub(r'_+', '_', s)
    # Remove leading and trailing underscores
    s = s.strip('_')
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


def is_likely_binary(data: bytes) -> bool:
    """
    Heuristic to determine if data is likely binary (as opposed to text).

    Checks the proportion of control characters in the data. If more than 1%
    of bytes are control characters (excluding common whitespace like tab,
    newline, carriage return), the file is likely binary.

    Args:
        data: Bytes to analyze (typically first few KB of a file)

    Returns:
        True if data appears to be binary, False if it appears to be text
    """
    if not data:
        return False

    control_count = 0
    for byte in data:
        # Count control characters, excluding common whitespace:
        # 9 (tab), 10 (LF), 11 (VT), 12 (FF), 13 (CR)
        if byte < 9 or (byte > 13 and byte < 32):
            control_count += 1

    # If more than 1% of bytes are control characters, consider it binary
    return control_count / len(data) >= 0.01


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