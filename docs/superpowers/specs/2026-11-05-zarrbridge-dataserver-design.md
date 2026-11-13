# Virtual OME-Zarr for image files via zarrbridge

Date: 2026-11-05. Branch `zarrbridge`, on top of `supervisor`.

## Intent

Let users browse, link and open legacy image files (TIFF, MRC, CZI, ND2, LIF, slides, DICOM, NIfTI, NRRD, FITS) exactly as they do OME-Zarr today, without converting anything. zarrbridge already serves these files as virtual OME-Zarr 0.5 over HTTP. Fileglancer runs one zarrbridge per user, as that user, under the supervisor, and routes the right requests to it.

## Goals

- Navigating into a supported file in the file browser shows the usual Zarr metadata view and open-with buttons.
- A data link on a supported file serves the virtual Zarr at `<link>/<file>/<zarr key>` to any viewer, and still serves the raw file at `<link>/<file>`.
- Works in dev with the embedded (unprivileged) supervisor and in production with the privileged one.
- zarrbridge is optional: without it, image files behave as before.

## Non-goals (this round)

- nginx `auth_request` fast path for chunk fan-out. Bytes stream through the app, like `/files/` today.
- An explicit data link type. The link is the same row; the virtual Zarr is implicit for supported files.
- A "Build multiscale" App. zarrbridge's in-process auto-build is on; the UI shows the state badge only.
- S3 `ListObjectsV2` over the virtual hierarchy.

## Design

### Supervisor: `kind: "dataserver"`

`acquire` with `kind: "dataserver"` returns `{"ok": true, "socket": "<path>", "pid": N}` with no fd. The supervisor keeps one zarrbridge per user:

- It binds and listens on `<socket dir>/zb-<user>.sock` itself (group-owned, mode 0660 in privileged mode, like its own socket), then spawns `python -m zarrbridge serve --fd <listen fd> --trusted-path-header X-Fg-Resolved-Path --allow-prefix / --no-browse --build-auto on` as the user, through the same identity and env-allowlist code as workers. Binding first means the app can connect before uvicorn is up; connections wait in the backlog.
- `--allow-prefix /` is deliberate: the process runs as the user, so uid is the containment, and the header is set only by the app after it has resolved the path inside a share.
- Every acquire refreshes `last_used`; the reaper stops a dataserver idle longer than `idle_timeout`. A waiter thread removes it when the process exits. Shutdown terminates them with the workers. `status` lists them.
- User validation is the same as for workers.

### zarrbridge

One new flag, `serve --fd N`, passed through to uvicorn. Nothing else changes.

### App

New module `fileglancer/zarrproxy.py`:

- `SUFFIXES`, `split_virtual_path(subpath) -> (file_subpath, key) | None`: the first path segment with a supported suffix that has at least one segment after it splits the path. Purely syntactic, since the app cannot stat the user's files.
- `proxy(socket_path, abs_path, key, request)`: streams GET/HEAD through httpx over the unix socket, forwarding `Range` and `If-None-Match` up and `ETag`, `Cache-Control`, `Content-*`, `X-Zarrbridge-*` down. One httpx client per socket path.
- `virtual_listing(socket_path, abs_path, info, subpath)`: fetches `zarr.json`, returns synthetic `files`: `zarr.json` plus one directory per multiscale dataset path.

Routing:

- `GET/HEAD /files/<key>/<path>`: after resolving the sharing key, if the subpath splits, proxy to the link owner's dataserver with `X-Fg-Resolved-Path: <mount>/<file>`. Otherwise the existing worker path.
- `GET /api/content/<fsp>/<path>`: same split, as the authenticated user.
- `GET /api/files/<fsp>?subpath=<file>`: when `info` is a supported file, attach the virtual listing. On any dataserver failure, log and return the plain file info.

`SupervisedWorkerPool.dataserver(username)` performs the acquire. In-process and legacy modes have no dataserver; the endpoints answer 501.

### Frontend

- `FileBrowser`: when the current item is a file but the listing has Zarr metadata files, render the table and ZarrPreview instead of the FileViewer. Everything downstream (metadata query, thumbnail, open-with, data link creation) already works on the file path because `/api/content/<fsp>/<file>/zarr.json` resolves.
- A small badge on ZarrPreview reads `/api/content/<fsp>?subpath=<file>/_status` and shows the zarrbridge levels state (native, building, multiscale, ...).

## Builder notes

- A directory named like a supported file (`foo.tif/`) is misrouted. Accepted for now; marked in code.
- A reaped dataserver between acquire and connect gives a 503; the next request respawns. Accepted.
- zarrbridge is installed into the pixi env with `pixi run pip install -e ../zarrbridge` for now; it is an optional extra in `pyproject.toml`.
