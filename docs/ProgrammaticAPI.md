# Programmatic API

Fileglancer exposes an HTTP API that other web apps can use to read and write files on the user's behalf. A second app (for example a data-analysis tool on another subdomain) can browse shares, read files, and save results through Fileglancer without implementing its own file access or its own login.

## How it works

Fileglancer authenticates every request with a `SameSite=Lax` session cookie (`fg_session`), set after the user logs in through Okta or simple auth. `SameSite=Lax` is evaluated against the *site* (the registrable domain, e.g. `janelia.org`), not the full origin — so the browser attaches this cookie to requests sent from any page under the same base domain, across subdomains and ports. Ports are ignored entirely for cookie scope.

That means an app served from `https://ai-cryoet.int.janelia.org` can call `https://fileglancer.int.janelia.org/api/...` with `credentials: 'include'` and the user's session cookie rides along automatically. The integrating app never handles tokens or credentials, and needs no login of its own. Because the same resolved user drives every existing endpoint (the API runs each file operation as that user through a per-user worker), an authenticated caller gets the full existing API surface for free.

When there is no session yet, the app opens a short-lived Fileglancer popup that runs the normal login flow and then closes itself. If the user already has a Fileglancer session, this is instant (or invisible, via a hidden-iframe check).

This design relies on the apps sharing a registrable domain. An app on an unrelated domain would need a token-based flow instead (not currently implemented).

## Configuration

Add each integrating app's origin to `api_allowed_origins` in `config.yaml`:

```yaml
api_allowed_origins:
  - https://ai-cryoet.int.janelia.org
  - https://nextflow.int.janelia.org:8444
```

List full origins: scheme, host, and port if non-default. The Fileglancer UI's own origin is always allowed and need not be listed. Development subdomains and ports (e.g. `https://nextflow.int.janelia.org:8443` for a Fileglancer dev site paired with `:8444` for a cryoet dev site) are configured the same way, per deployment.

This list is the cross-site security boundary. On every authenticated endpoint, a request that carries an `Origin` header which is neither same-origin nor on this list is rejected with `403` before the session is consulted. Requests with no `Origin` header (same-origin GETs, server-to-server, curl) are unaffected. This closes a latent exposure: the CORS policy is intentionally wide open (`*`) so anonymous `/files/{sharing_key}` data links work in external viewers like Neuroglancer, which would otherwise let any same-site page ride a logged-in cookie. The allowlist gates the cookie-authenticated surface specifically.

For local development over plain HTTP, set `session_cookie_secure: false` so the cookie is sent without HTTPS.

## API endpoints

All endpoints require the session cookie. The path segment after `/api/files/` or `/api/content/` is a file-share-path name; the path within that share is passed as the `subpath` query parameter.

| Method & path | Purpose |
|---------------|---------|
| `GET /api/auth/status` | Current auth status (safe when unauthenticated). |
| `GET /api/auth/allowed-origins` | The configured cross-origin allowlist (public). |
| `GET /api/file-share-paths` | List available file shares. |
| `GET /api/files/{fsp}?subpath=...` | List a directory, or get info for one path. |
| `GET /api/content/{fsp}?subpath=...` | Read file contents (supports HTTP Range). |
| `PUT /api/content/{fsp}?subpath=...` | Create or overwrite a file with the request body (streamed). |
| `POST /api/files/{fsp}?subpath=...` | Create an empty file or a directory (`{"type": "file"|"directory"}`). |
| `PATCH /api/files/{fsp}?subpath=...` | Rename/move (`{"path": ...}`) or change permissions (`{"permissions": ...}`). |
| `DELETE /api/files/{fsp}?subpath=...` | Delete a file or empty directory. |

`PUT /api/content` is the write path used by a "Save" action. It creates the file if absent or replaces its contents if present, streaming the body to disk so large uploads do not buffer in memory. The parent directory must already exist — create it first with `POST /api/files` (`{"type": "directory"}`). The file is created with the user's ownership and permissions.

### Optimistic concurrency

To avoid clobbering a concurrent edit, `GET`/`HEAD /api/content` return an `ETag` (a strong validator derived from the file's modification time and size) and a `Last-Modified` header. A `PUT` may then carry a precondition:

- `If-Match: "<etag>"` — write only if the file's current ETag matches. Use `If-Match: *` to require the file already exist.
- `If-Unmodified-Since: <http-date>` — write only if the file hasn't changed since that time (1-second granularity — `If-Match` is the precise option).

If the precondition fails the server returns `412 Precondition Failed` and **leaves the file untouched** (the check runs against the opened file before it is truncated). The typical flow: read the file (keep its `ETag`), and on save `PUT` with `If-Match: <that etag>`; on `412`, tell the user the file changed and re-read.

ETag caveat: it's based on mtime + size, so two writes within the filesystem's mtime resolution (coarse on some NFS) that also keep the same size can share an ETag. Good enough for interactive save-conflict detection, not a substitute for locking.

The `ETag` is specific to `/api/content`: data links served under `/files/` carry S3-style ETags computed differently, so never compare validators across the two. `Last-Modified` is an HTTP-date (`Tue, 14 Nov 2023 22:13:20 GMT`); `If-Unmodified-Since` also accepts the ISO 8601 form older clients may have stored.

`GET /api/content` honours a single byte `Range` (`bytes=0-499`, `bytes=500-`, `bytes=-500`) with `206`; a range starting past the end of the file is `416`. A multi-range or malformed `Range` header is ignored and the whole file is returned with `200`, as S3 does.

## The connect (login) flow

A dedicated bare page, `GET /connect-complete`, drives the popup handshake. The integrating app opens it (in a popup, or a hidden iframe with `?silent=1`) with an `origin` query parameter naming the app's own origin. Once the user is authenticated, the page posts a message back to that origin and, for a popup, closes itself:

```js
{ type: 'fileglancer:connected', authenticated: true, username: '...' }
```

The page validates the requested origin against the server allowlist before posting, and only ever targets that exact origin. If the user is not authenticated, a popup is forwarded through the normal `/login` flow (returning to `/connect-complete` afterward), while a silent iframe reports `authenticated: false` so the caller knows to escalate to a visible popup.

The popup channel does not carry any secret: the session cookie is `httponly` and is set on the Fileglancer origin, never exposed to the app. Even if a message reached a page that was not allowlisted, that page still could not call the API — the server rejects its origin with `403`.

## JavaScript client

A small browser client, `@fileglancer/client`, is provided under `clients/js/`. It wraps the endpoints, sends every request with credentials, and implements the popup/iframe handshake. Typical usage in a "Save" handler:

```ts
import { FileglancerClient } from '@fileglancer/client';

const fg = new FileglancerClient({ baseUrl: 'https://fileglancer.int.janelia.org' });

async function onSaveClick() {
  await fg.connect(); // instant if already logged in; popup if not
  await fg.writeFile('groups_scicompsoft', 'results/out.csv', csvBlob);
}
```

See `clients/js/README.md` for the full method list and error handling.

## Security summary

- The session cookie is `httponly` and never exposed to the integrating app's JavaScript.
- `SameSite=Lax` is preserved — no `SameSite=None`, so this is not subject to third-party-cookie deprecation. It works because the apps are same-site.
- `api_allowed_origins` is enforced on the server for every authenticated request; it is the authoritative cross-site boundary.
- The connect popup validates and targets only allowlisted origins, and transmits no secret.
- All file operations run as the authenticated user via the existing per-user worker, so filesystem permissions apply unchanged.
