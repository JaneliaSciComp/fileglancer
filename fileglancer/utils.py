import re


def slugify_path(s):
    """Slugify a path to make it into a name"""
    # Replace any special characters with underscores
    s = re.sub(r'[^a-zA-Z0-9]', '_', s)
    # Replace multiple underscores with a single underscore
    s = re.sub(r'_+', '_', s)
    # Remove leading underscores
    s = s.lstrip('_')
    return s