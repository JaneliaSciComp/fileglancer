"""Read and rewrite Fileglancer Data Link references inside Neuroglancer
layer sources.

A Data Link URL is ``{external_proxy_url}/{sharing_key}/{quote(url_prefix)}``
(see ``_convert_proxied_path`` in server.py). NG layer ``source`` values are a
string, a ``{"url": ...}`` dict, or a list of either; URLs may carry a
``zarr://``-style scheme prefix and a ``|zarr2:``-style pipeline suffix.
"""
import os
import re
from typing import Any, Iterator, Optional
from urllib.parse import quote

_SCHEME_PREFIX = re.compile(r'^[a-z0-9+.-]+://(?=https?://)', re.IGNORECASE)
# A segment ends at a path separator, the NG pipeline separator, a query,
# a fragment, or the end of the URL — so "/K/img.zarr" never matches "/K/img.zarr2".
_SEGMENT_END = r'(?=[/|?#]|$)'


def _iter_source_urls(source: Any) -> Iterator[str]:
    if isinstance(source, str):
        yield source
    elif isinstance(source, dict):
        url = source.get('url')
        if isinstance(url, str):
            yield url
    elif isinstance(source, list):
        for item in source:
            yield from _iter_source_urls(item)


def _sharing_key_from_url(url: str, proxy_url: str) -> Optional[str]:
    base = _SCHEME_PREFIX.sub('', url.split('|', 1)[0])
    prefix = proxy_url.rstrip('/') + '/'
    if not base.startswith(prefix):
        return None
    return base[len(prefix):].split('/', 1)[0] or None


def layer_sharing_key(layer: dict, proxy_url: str) -> Optional[str]:
    """The Data Link sharing key of the first proxied source in `layer`."""
    for url in _iter_source_urls(layer.get('source')):
        key = _sharing_key_from_url(url, proxy_url)
        if key:
            return key
    return None


def data_link_segment(sharing_key: str, url_prefix: str) -> str:
    return f"/{sharing_key}/{quote(url_prefix, safe='/')}"


def layer_uses_segment(layer: dict, segment: str) -> bool:
    pattern = re.compile(re.escape(segment) + _SEGMENT_END)
    return any(pattern.search(url) for url in _iter_source_urls(layer.get('source')))


def rewrite_layer_segment(layer: dict, old_segment: str, new_segment: str) -> dict:
    """Copy of `layer` with every source's `old_segment` replaced."""
    pattern = re.compile(re.escape(old_segment) + _SEGMENT_END)

    def fix(source: Any) -> Any:
        if isinstance(source, str):
            return pattern.sub(lambda _m: new_segment, source)
        if isinstance(source, dict) and isinstance(source.get('url'), str):
            return {**source, 'url': fix(source['url'])}
        if isinstance(source, list):
            return [fix(item) for item in source]
        return source

    out = dict(layer)
    if 'source' in out:
        out['source'] = fix(out['source'])
    return out


def default_url_prefix(fsp_name: str, path: str) -> str:
    """The url_prefix create_proxied_path picks when none is given."""
    return quote(os.path.basename(path) or fsp_name, safe='/')
