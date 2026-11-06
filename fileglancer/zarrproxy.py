"""Virtual OME-Zarr for image files, served by a per-user zarrbridge.

The supervisor runs one ``zarrbridge serve`` per user (``kind: dataserver``)
on a unix socket. This module decides which requests belong to it and
streams them through: a path like ``dir/image.tif/0/c/0/0`` is the file
``dir/image.tif`` plus the zarr key ``0/c/0/0``. The absolute file path goes
to zarrbridge in a trusted header; the URL path it sees is the key only.

Nothing here touches the filesystem: the app cannot read the user's files,
so the split is syntactic and the absolute path comes from the user's worker
(``resolve_image``), which confines it to the share and the data link.
"""

from __future__ import annotations

import posixpath
from typing import Optional
from urllib.parse import quote

import httpx
from fastapi import Request, Response
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

from fileglancer.supervisor.spawn import DATASERVER_HEADER

# Keep in step with zarrbridge's readers: MRC family, TIFF, and everything
# refkv zarrifies. A directory named like one of these would be misrouted;
# ponytail: accepted, a stat through the worker fixes it if it ever matters.
SUFFIXES = frozenset({
    ".mrc", ".rec", ".st", ".ali", ".map", ".mrcs",
    ".tif", ".tiff",
    ".czi", ".nd2", ".lif", ".ndpi", ".svs", ".ims",
    ".dcm", ".nii", ".nii.gz", ".nrrd", ".nhdr", ".fits", ".fit", ".fts",
})

_PASS_UP = ("range", "if-none-match", "accept-encoding")
_PASS_DOWN = ("content-type", "content-length", "content-range", "accept-ranges",
              "etag", "cache-control", "x-zarrbridge-source", "x-zarrbridge-read")


def is_image_file(name: str) -> bool:
    lower = name.lower()
    return any(lower.endswith(s) for s in SUFFIXES)


def split_virtual_path(subpath: str) -> Optional[tuple[str, str]]:
    """``(file subpath, zarr key)`` if the path runs through an image file.

    The first segment with a supported suffix that has anything after it is
    the file. ``image.tif`` alone is None: that is the raw file.
    """
    parts = [p for p in subpath.split("/") if p]
    for i, part in enumerate(parts[:-1]):
        if is_image_file(part):
            return "/".join(parts[:i + 1]), "/".join(parts[i + 1:])
    return None


def link_target(path: str) -> str:
    """The filesystem object a data link on ``path`` must validate against:
    the image file itself when ``path`` points inside its virtual Zarr."""
    split = split_virtual_path(path)
    return split[0] if split else path


_clients: dict[str, httpx.AsyncClient] = {}


def _client(socket_path: str) -> httpx.AsyncClient:
    client = _clients.get(socket_path)
    if client is None:
        client = _clients[socket_path] = httpx.AsyncClient(
            transport=httpx.AsyncHTTPTransport(uds=socket_path),
            base_url="http://zarrbridge", timeout=httpx.Timeout(60.0, connect=30.0))
    return client


async def proxy(socket_path: str, abs_path: str, key: str, request: Request) -> Response:
    """Stream one GET/HEAD for ``key`` of the file at ``abs_path``."""
    headers = {k: v for k, v in request.headers.items() if k.lower() in _PASS_UP}
    headers[DATASERVER_HEADER] = abs_path
    client = _client(socket_path)
    req = client.build_request(request.method, "/" + quote(key), headers=headers)
    try:
        upstream = await client.send(req, stream=True)
    except httpx.HTTPError as e:
        return Response(f"zarrbridge unavailable: {e}", status_code=503)
    out_headers = {k: v for k, v in upstream.headers.items() if k.lower() in _PASS_DOWN}
    ctype = upstream.headers.get("content-type", "")
    out_headers["X-Is-Binary"] = "false" if ctype.startswith(("application/json", "text/")) else "true"
    return StreamingResponse(upstream.aiter_raw(), status_code=upstream.status_code,
                             headers=out_headers, background=BackgroundTask(upstream.aclose))


def _entries(info: dict, key: str, meta: dict, images: list, zarr_json_size: int) -> list[dict]:
    """Synthetic directory entries for node ``key`` of an image file: ``zarr.json``
    plus one directory per multiscale level, or, for a container group without
    multiscales, one per child image (bioformats2raw layout)."""
    base = posixpath.join(info["path"], key) if key else info["path"]

    def entry(name: str, is_dir: bool, size: int) -> dict:
        return {**info, "name": name, "path": posixpath.join(base, name),
                "absolute_path": posixpath.join(info.get("absolute_path") or "", key, name),
                "is_dir": is_dir, "size": size, "is_symlink": False, "symlink_target_fsp": None}

    files = [entry("zarr.json", False, zarr_json_size)]
    multiscales = (meta.get("attributes", {}).get("ome", {}) or {}).get("multiscales") or []
    children = [ds.get("path") for ds in ((multiscales[0].get("datasets") if multiscales else []) or [])]
    if not children:
        prefix = key + "/" if key else ""
        children = [img["path"][len(prefix):].split("/")[0] for img in images
                    if img.get("path", "").startswith(prefix) and img["path"] != key]
    for name in dict.fromkeys(c for c in children if c and "/" not in c):
        files.append(entry(name, True, 0))
    return files


async def virtual_node(socket_path: str, abs_path: str, info: dict, key: str = "") -> Optional[dict]:
    """``{"info", "files"}`` for a group or array at ``key`` inside the image
    file, ``{"info"}`` for a leaf such as ``zarr.json`` or a chunk, None when
    zarrbridge has nothing at ``key``.

    Raises httpx.HTTPError when zarrbridge cannot be reached and ValueError
    when it does not serve this file.
    """
    client = _client(socket_path)
    headers = {DATASERVER_HEADER: abs_path}
    resp = await client.get("/" + quote(posixpath.join(key, "zarr.json")), headers=headers)
    if resp.status_code == 200:
        images = []
        meta = resp.json()
        if not (meta.get("attributes", {}).get("ome", {}) or {}).get("multiscales"):
            status = await client.get("/_status", headers=headers)
            images = status.json().get("images", []) if status.status_code == 200 else []
        files = _entries(info, key, meta, images, len(resp.content))
        if not key:
            return {"info": info, "files": files}
        node = {**info, "name": posixpath.basename(key), "path": posixpath.join(info["path"], key),
                "absolute_path": posixpath.join(info.get("absolute_path") or "", key),
                "is_dir": True, "size": 0, "is_symlink": False, "symlink_target_fsp": None}
        return {"info": node, "files": files}
    if not key:
        raise ValueError(f"zarrbridge {resp.status_code}: {resp.text[:200]}")
    head = await client.head("/" + quote(key), headers=headers)
    if head.status_code != 200:
        return None
    leaf = {**info, "name": posixpath.basename(key), "path": posixpath.join(info["path"], key),
            "absolute_path": posixpath.join(info.get("absolute_path") or "", key),
            "is_dir": False, "size": int(head.headers.get("content-length") or 0),
            "is_symlink": False, "symlink_target_fsp": None}
    return {"info": leaf}
