# HTTPS Proxy for App Services

Running app services (`type: service`) bind a port on a compute node and publish `http://<node>:<port>/...`. Set `apps.service_proxy_domain` to republish them over HTTPS at a per-job subdomain instead:

```
https://job-12-k7m2qhxr.services.example.org/lab?token=8f2c...
```

The `job-<id>-<mac>` label is signed with `session_secret_key`. Job ids are a small global sequence, so an unsigned `job-12` label would let anyone who can reach the proxy sweep `job-1`..`job-500` and find — and, for any service that does not enforce its own token, reach — every running service on the instance. The MAC is 8 base32 characters (40 bits); guessing it is online-only against a reverse proxy that answers 403, so a sweep of that space takes decades at 10k requests/second.

Design rationale: `docs/superpowers/specs/2026-08-28-app-service-https-proxy-design.md`.

## What you need

- **A wildcard DNS record for the zone**, e.g. `*.services.example.org`, pointing at the Fileglancer host. No zone delegation is required — a wildcard may sit at any level (RFC 4592), so one record in the parent zone is enough:

  ```
  *.services   IN  A   <fileglancer host IP>
  ```

  A wildcard never matches its own parent, so this does not make `services.example.org` itself resolve. Add a plain `services IN A` record if you want the bare alias to work; the proxy does not need it.

- **A wildcard TLS certificate for that zone.** A wildcard matches exactly one label, so a certificate for `*.example.org` does **not** cover `job-1.services.example.org` — it must name the zone you actually use. If the host already serves a `*.example.org` certificate, the two coexist fine: two `server` blocks on port 443, each with its own `ssl_certificate`, selected by SNI. Leave `default_server` on the primary block.

- **A reverse proxy with `http_auth_request_module`** compiled in (`nginx -V | grep auth_request`).

## Fileglancer configuration

```yaml
session_secret_key: "<a long random string>"
apps:
  service_proxy_domain: "services.example.org"
```

Leave `service_proxy_domain` empty to disable; the direct `http://<node>:<port>` URL is then published unchanged.

`session_secret_key` is required when the proxy domain is set, and the server refuses to start without it. An unset key is generated at random per process, so under `uvicorn --workers N` each worker would sign hostnames with a different key and most proxied requests would be refused. Rotating it invalidates live service URLs, on top of the session revocation rotation already causes.

## Apps that opt out

An individual service can decline to be republished by setting `service_proxy: false` on its entry point. Its direct `http://<node>:<port>` URL is published instead, and the resolve endpoint refuses its hostname, so it cannot be reached through the proxy even by someone who can derive the signed label. Refusals are counted as `refused_proxy_disabled` in the aggregate resolve log line.

The flag is snapshotted onto the job row at submit time, so editing the manifest does not change the decision for a job that is already running. It exists for services that cannot work behind the proxy at all — one whose OAuth callback is registered against a fixed host and port, say — and not as a performance or preference switch. An app that opts out gives up transport encryption on every hop, including the one from the user's browser, so it should not be sent credentials worth protecting.

## Reverse proxy configuration

Fileglancer does not proxy the traffic itself. It exposes `GET /api/apps/resolve`, which reads the `Host` header and answers `204` with `X-Fg-Upstream: <host>:<port>`, or `403`. The reverse proxy resolves each request through it and connects to the upstream directly, so no proxied bytes pass through the application server.

Add a server block for the wildcard zone. This assumes a `map $http_upgrade $connection_upgrade` block already exists at the http level:

```nginx
server {
  listen 443 ssl http2;
  server_name ~^job-\d+-[a-z2-7]+\.services\.example\.org$;

  ssl_certificate     /etc/nginx/certs/services-wildcard.crt;
  ssl_certificate_key /etc/nginx/certs/services-wildcard.key;

  location = /_fg_resolve {
    internal;
    proxy_pass              http://127.0.0.1:8989/api/apps/resolve;
    proxy_pass_request_body off;
    proxy_set_header        Content-Length "";
    proxy_set_header        Host $host;
  }

  location / {
    auth_request     /_fg_resolve;
    auth_request_set $upstream $upstream_http_x_fg_upstream;

    # Required because proxy_pass targets a variable. Use whatever resolver the
    # host actually runs; 127.0.0.53 is systemd-resolved's stub.
    resolver 127.0.0.53 valid=30s;
    proxy_pass http://$upstream;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;

    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection $connection_upgrade;

    proxy_http_version 1.1;
    proxy_buffering    off;
    proxy_read_timeout 3600s;
  }

  # A refused resolution means the service is gone, not that the user did
  # something wrong, so serve Fileglancer's explanation instead of nginx's
  # stock 403 page. The `=` makes the response carry the page's own 503.
  error_page 403 = /_fg_unavailable;

  location = /_fg_unavailable {
    internal;
    proxy_pass       http://127.0.0.1:8989/api/apps/service-unavailable;
    proxy_set_header Host $host;
  }
}
```

Also add this to the **main** server block, so the resolve endpoint is not reachable on the primary hostname:

```nginx
  location = /api/apps/resolve { return 404; }
```

Six details are load-bearing:

- **`internal;`** on the `/_fg_resolve` location makes it reachable only from nginx's own `auth_request` subrequest, never from a client. Together with the `return 404` in the main server block, it is what keeps the unauthenticated resolve endpoint off the network. Do not remove either.
- **`proxy_set_header Host $host`** passes the app subdomain through unchanged, so the app sees `Host` and `Origin` as the same value. This is what makes JupyterLab's WebSocket origin check pass without per-app configuration.
- **`resolver`** is mandatory. Without it nginx refuses to start when `proxy_pass` targets a variable.
- **`proxy_buffering off`** and the long `proxy_read_timeout` suit long-lived WebSocket and streaming sessions, such as the remote desktop app.
- **`proxy_intercept_errors` must stay off** (its default) for the `error_page 403` above to mean what it says. The 403 it catches is the one nginx generates when `auth_request` is denied; turning interception on would also catch a 403 from the app itself — a JupyterLab token rejection, say — and replace it with the "503 Service Unavailable" page.
- **`/_fg_unavailable` is a prefix location, not a named one**, because nginx refuses a `proxy_pass` with a URI part inside a named location (`proxy_pass cannot have URI part in location given by regular expression, or inside named location`). `internal;` is what keeps it out of the URL space the app sees, so a request for that path gets a 404 rather than the error page.

The existing HTTP-to-HTTPS redirect block is typically `default_server` with `server_name _`, in which case it already covers the new subdomains.

## Verification

Once DNS and the certificate are in place, launch each service app and confirm it loads and stays connected. WebSocket behavior is the thing to watch:

- JupyterLab — kernel connects, a cell executes.
- marimo — the notebook is interactive, not stuck "connecting".
- OpenVSCode — the editor loads and a terminal opens.
- Remote Desktop — the noVNC canvas renders and accepts input.
- TensorBoard — plots load.

If an app rejects the proxied origin, fix it in that app's manifest (most servers have an allowed-origin or base-URL option); do not weaken the proxy configuration.

## Residual risks

- Set `apps.service_proxy_upstream_zone` to the DNS zone your compute nodes live in, e.g. `nodes.example.org`. Without it the proxy will dial any host the Fileglancer host can reach, because the upstream comes from a file the user's job wrote. Loopback, the unspecified address, link-local (including cloud instance metadata), multicast and reserved addresses are always refused, since those are what reach the Fileglancer host itself. Private and public node addresses are allowed — an address on a routable interface is already reachable directly by any cluster user. Matching is on whole DNS labels, so a leading dot is optional and a sibling zone like `evil-nodes.example.org` does not qualify. The zone applies to hostnames only: a service that publishes the node's IP instead of its name is still accepted, so setting a zone will not break one. To confine those, set `apps.service_proxy_upstream_networks` to the CIDR networks your nodes occupy, e.g. `10.20.0.0/16`. The two settings divide the space between them — the zone governs upstreams published as names, the networks govern upstreams published as addresses — and each is empty by default, meaning no restriction on that form. Bad CIDR entries are refused at startup rather than at request time, since a typo there would otherwise reject every address upstream while looking configured.
- The signed hostname is not a substitute for a service enforcing its own token. It is unguessable, but a hostname leaks where a query string does not: plaintext SNI on the wire, DNS resolvers, and the proxy's own access log. Treat it as what makes enumeration infeasible, and `${FG_SERVICE_TOKEN}` as the credential. An app with no authentication of its own (TensorBoard, for one) is protected only by the label.
- A published `service_url` may instead carry standard HTTP Basic Auth userinfo (`http://user:pass@node:port/...`) for a service that enforces that rather than a query-string token — useful for services a CLI tool like `curl` also needs to authenticate against, not just a browser. It is forwarded to the proxied URL exactly like the query string is, and is never seen by nginx (only the bare `host:port` is used as the `proxy_pass` target). It is strictly weaker than a query-string token for anything embedded (JupyterLab, noVNC): browsers only honor `user:pass@host` on direct navigation to the link, not reliably inside an `iframe` or across a WebSocket upgrade, and some browsers show an interstitial warning or drop it across a redirect. It remains visible in the browser's address bar and history, the same class of exposure the query-string token already has.
- The resolve endpoint is called once per proxied HTTP request, so a single page load of an app like JupyterLab generates dozens. Successful resolutions are cached in-process for 10 seconds, which collapses that burst to roughly one database read per service per 10 seconds per worker. Refusals are deliberately not cached, so a service starts resolving the moment it publishes its URL. The endpoint is excluded from the per-request access log for the same reason and reports running totals once a minute instead — grep for `service proxy resolve totals` to see hits, misses and refusals by reason.
- That 10-second cache is also the window in which a job that has just stopped can still be proxied. Compute-node ports get recycled, so the window is kept short deliberately; if a port is reused within it, a client can briefly reach the new occupant, which will reject it for lack of that service's own token.
- A service that manages its own URL (`auto_url` unset) should write its URL file exactly once. The cached upstream is refreshed only while someone has the job's detail page open, so a URL that changes mid-run can go stale.
