import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

from x2s3.utils import guess_content_type  # noqa: F401  re-exported; one implementation

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


def make_etag(last_modified: float, size: int) -> str:
    """Strong ETag for a file, derived from its mtime and size.

    Consistent across the read (GET/HEAD) and write (PUT precondition) paths
    because all of them feed the same stat fields in here.

    ponytail: mtime granularity is the ceiling — two writes within the
    filesystem's mtime resolution (coarse on some NFS) that also keep the same
    size would share an ETag. Switch to a content hash if that ever matters.
    """
    return f'"{last_modified:.6f}-{size}"'


def parse_http_date_to_epoch(value: str):
    """Parse an HTTP-date or ISO-8601 datetime to a POSIX timestamp (float).

    Accepts both because we emit Last-Modified in ISO form; returns None if the
    value can't be parsed.
    """
    from email.utils import parsedate_to_datetime
    for parse in (parsedate_to_datetime, datetime.fromisoformat):
        try:
            dt = parse(value)
        except (TypeError, ValueError):
            continue
        if dt is None:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    return None


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


def s3_public_url(bucket: str, endpoint_url: Optional[str], key: str = '') -> str:
    """Direct anonymous HTTPS URL for an object key ('' for the bucket or prefix itself).

    AWS buckets get virtual-hosted URLs unless the name has a dot, which the
    *.s3.amazonaws.com wildcard certificate cannot cover; custom endpoints are path style.
    """
    if endpoint_url:
        base = f"{endpoint_url}/{bucket}"
    elif '.' in bucket:
        base = f"https://s3.amazonaws.com/{bucket}"
    else:
        base = f"https://{bucket}.s3.amazonaws.com"
    return f"{base}/{quote(key, safe='/')}" if key else base
