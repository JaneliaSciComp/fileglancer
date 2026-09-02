# Authenticating the app-service proxy's upstream hop — options, parked

Deferred design notes, not a plan. Split out of #440 and
JaneliaSciComp/fileglancer-hub#15, which give the browser HTTPS to nginx and
leave the nginx→app-host hop plain HTTP.

**Status: parked as too heavy for a mostly trusted intranet.** Recorded so the
reasoning is not re-derived if the deployment ever reaches a less trusted
network — a wider vhost exposure, a cloud burst, or a multi-tenant cluster.
The low-effort step actually taken is opportunistic encryption only (option A
below): the proxy dials whatever scheme the service published, and does not
verify the certificate.

## Two apps already serve TLS with self-signed certificates

Found after the options below were first written, and it changes their weighting
rather than any of their mechanics.

- **`JaneliaSciComp/marimo_ai_sandbox`** — `container/caddy-lib.sh`'s
  `caddy_generate_cert` makes an `openssl` self-signed EC P-256 leaf, 10-year
  validity, persisted per host under `CERT_DIR` and regenerated only when the
  hostname changes. SANs are the node FQDN, the short hostname, `localhost` and
  the host's IP addresses. Caddy serves it with `tls $CERT_FILE $KEY_FILE` (not
  Caddy's internal-CA issuer, which shells out to `sudo` and hangs on a compute
  node). `container/https-wrap.sh:262` publishes
  `https://<host>:<port>/?access_token=…`. It bypasses `auto_url` specifically
  so Fileglancer does not publish the backend's plain-HTTP port instead of
  Caddy's TLS one.
- **`JaneliaSciComp/mhs-spec-review#1`** — Caddy with `tls internal`
  (Caddy's own internal CA, `skip_install_trust`) on a fixed port 8443, and
  writes `https://$(hostname -f):8443/`.

Neither certificate is trusted by any system store, so both need option A.
Neither app can be verified under option C without changing how it generates
certificates.

## The constraint that shapes all of it

The upstream is a new node and port on every launch, sometimes published as a
bare IP address, and it arrives in a file the user's own job wrote. Nothing
about it is stable enough to name in static configuration.

## A. Self-signed, unverified — `proxy_ssl_verify off`

Confidentiality against passive capture on the node network. No authentication
of the upstream. Not a regression, since nothing authenticates the upstream
today either, but it has to be documented as opportunistic encryption rather
than as verified TLS. **This is the option being pursued.**

It is also the only option the two existing TLS apps work under as written.
Leave `proxy_ssl_name` at its default (the `proxy_pass` host) rather than
setting it to `$host`: both apps' certificates are SAN'd to the node's own
name, which is what the default sends.

## B. Self-signed with fingerprint pinning

What would make self-signed meaningful, and nginx cannot do it:
`proxy_ssl_trusted_certificate` is a static path with no variable support, and
there is no upstream-fingerprint directive.

Workarounds are worse than they sound. Appending each job's certificate to a
trust bundle and reloading nginx per service launch is racy, and the bundle
grows without bound. Moving the hop onto something that can pin per connection
(ghostunnel, Envoy with ext_authz) introduces a new component that carries the
noVNC video stream — the thing #440 went out of its way to avoid.

Considered and rejected on its own merits, independent of the intranet
judgement.

## C. Internal CA

Issue a short-lived leaf per service job with
`SAN = job-<id>.services.int.janelia.org`, which is exactly the value nginx
already has in `$host`:

```nginx
proxy_ssl_trusted_certificate /etc/nginx/certs/fg-app-ca.pem;
proxy_ssl_verify       on;
proxy_ssl_verify_depth 2;
proxy_ssl_server_name  on;
proxy_ssl_name         $host;
```

The verification config is fully static, and the certificate binds to the *job*
rather than to the node. That is what makes it tractable at all when the node
name changes every launch and is sometimes an IP address that name-based
verification could never cover.

Issuance would fit where the plumbing already is: write `service_tls.{crt,key}`
(0600, user-owned) into the work dir at submit time and export
`FG_SERVICE_TLS_CERT` / `FG_SERVICE_TLS_KEY` from the preamble at
`fileglancer/apps/jobs.py`, next to the `SERVICE_URL_PATH` export. Lifetime = max
walltime plus slack. The CA key stays root-only on the Fileglancer host and off
the shared filesystem, or comes from step-ca / Vault if one is already run.

Strictly this is "we are our own CA," not per-app self-signed.

Note the interaction with the two existing TLS apps: `proxy_ssl_name $host`
sends the job subdomain as the SNI and requires it in the leaf's SAN, which
neither app's self-generated certificate has. Adopting C therefore means
converting both apps to consume an issued certificate, not just adding nginx
directives — a migration cost the sketch above hides.

Parked because it means running a CA — key custody, rotation, an issuance path
in the submit hot path — to defend against an active on-path attacker inside
the cluster network. That is not the threat model here.

## Non-option, recorded so it is not re-proposed

Compute nodes are `<host>.int.janelia.org`, so the existing org wildcard
certificate would cover them with no new PKI at all. Rejected: its private key
would have to be readable by every user's job.

## The app side: getting services to serve TLS

Support is uneven across the shipped apps. Jupyter has `--certfile` /
`--keyfile`; openvscode-server and websockify vary; TensorBoard has none.
Per-manifest TLS flags therefore mean an open-ended per-app tail — the same trap
the subdomain-over-path-prefix decision in #440 was made to avoid.

The uniform alternative, if this is ever revisited: keep the app on
`127.0.0.1:$PORT` and put a TLS terminator in the job wrapper, binding the
public port with the issued certificate. One change in the `jobs.py` preamble
instead of N manifest changes, and `auto_url` apps get it for free. It also
closes a hole that exists independent of all this — the raw app port is
reachable by any cluster user today. With ghostunnel, nginx could additionally
present a `proxy_ssl_certificate` that the sidecar requires, making the app
reachable *only* through the proxy.

This is not hypothetical: both apps above already do exactly this with Caddy,
arrived at independently, and `marimo_ai_sandbox` has already factored the
machinery into a reusable `caddy-lib.sh` shared by its HTTPS and web-terminal
wrappers. If a uniform terminator is ever wanted, that file is the closest
thing to a prototype, and Caddy is the more likely choice than stunnel purely
because two apps already depend on it.

Parked with C only insofar as *issued* certificates go: the sidecar needs
something to bind with, and without an issuance story it can only bind a
self-signed certificate — which is what these two apps already do for
themselves, so a Fileglancer-provided sidecar would add nothing at option A.

## What is not parked

The scheme plumbing: return the upstream scheme instead of discarding it, carry
it in its own `X-Fg-Upstream-Scheme` header (including through the TTL cache, or
cached hits silently downgrade), and let nginx `proxy_pass
$upscheme://$upstream`. An earlier draft gated this on an
`apps.service_proxy_upstream_tls: allow | require` setting; that was withdrawn,
because `require` would refuse every plaintext app and TensorBoard has no TLS
option at all, which left the setting with one legal value. A `plaintext`
counter in the existing once-a-minute resolve totals gives an operator the same
visibility without refusing anyone's launch.

Because those two apps exist, this is not an enhancement — it is a
**prerequisite for setting `apps.service_proxy_domain` at all.** Discarding the
scheme means nginx does `proxy_pass http://<node>:8443` at a TLS listener, and
Caddy answers a plaintext request to an HTTPS port with a 400. Both apps break
the moment the proxy is enabled.

Two further per-app breakages, independent of the scheme and belonging to those
repos rather than to Fileglancer:

- `mhs-spec-review`'s Caddyfile site address is Host-matched
  (`{$CADDY_HOSTNAME}:8443, localhost:8443, 127.0.0.1:8443`). nginx passes
  `Host $host` through unchanged — load-bearing for Jupyter's WebSocket origin
  check — so Caddy sees `job-<id>.services.int.janelia.org`, matches no site
  and 404s even once the scheme is right. It needs a catch-all `:8443` site
  address. `marimo_ai_sandbox` uses a port-only address and is unaffected.
- That app's GitHub OAuth callback is pinned to
  `https://int.janelia.org:8443/callback` with wildcard matching, and its
  `url_for(_external=True)` + `ProxyFix` would produce
  `https://job-<id>.services.int.janelia.org/callback` behind the proxy —
  different port, two extra labels. Whether GitHub's wildcard matching accepts
  that needs checking; if not, that app wants a way to opt out of being
  republished rather than a fix.

The second one suggests a gap worth considering separately: there is currently
no way for a manifest to say "do not proxy me."

Also: hub#15's per-app verification checklist lists only the five shipped
service apps. Both Caddy apps should be on it, since they are the only two that
exercise the TLS path at all.
