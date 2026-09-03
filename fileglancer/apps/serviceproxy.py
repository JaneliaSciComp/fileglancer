"""URL helpers for serving app services behind an HTTPS reverse proxy.

A service job publishes ``http://<node>:<port><suffix>`` to its work directory.
When a proxy domain is configured, Fileglancer republishes that as
``https://job-<id>-<mac>.<proxy_domain><suffix>`` and tells the reverse proxy
which upstream the hostname maps to. These functions are the whole translation
layer between the two forms, kept pure so they can be tested without a database.
"""

import base64
import hashlib
import hmac
import ipaddress
import re
import time
from collections import Counter
from functools import lru_cache
from typing import Iterable, Optional
from urllib.parse import urlsplit, urlunsplit

from cachetools import TTLCache
from loguru import logger

# An upstream nginx can hand to proxy_pass: hostname and explicit port, nothing
# else. Deliberately strict — the value is interpolated into a proxy_pass
# directive, so userinfo, whitespace, CR/LF and bracketed IPv6 literals are all
# rejected rather than escaped.
_UPSTREAM_RE = re.compile(r'^([A-Za-z0-9.-]+):(\d{1,5})$')

# Hostnames that always name the local machine, so an upstream naming one would
# aim the proxy at the web host itself rather than at a compute node.
_LOCAL_NAMES = frozenset({'localhost'})

# Job ids are a small global sequence, so a bare job-<id> label would let anyone
# who can reach the proxy sweep job-1..job-500 and find every running service on
# the instance — and reach any of them that does not enforce its own token. The
# label therefore carries a MAC over the id, keyed by the server's session
# secret. Signing rather than storing a random key keeps the id in the hostname,
# so resolution stays one indexed read with no extra column, and the MAC is
# checked before the database is touched at all.
#
# Eight base32 characters is 40 bits. Guessing is online-only — a wrong label is
# a 403 from the reverse proxy, and there is nothing to attack offline — so at
# 10k requests/second a sweep of the space takes decades. Rotating
# session_secret_key invalidates live service URLs, which is the same blast
# radius as the session revocation that rotation already causes.
_MAC_CHARS = 8


def _service_mac(job_id: int, secret: str) -> str:
    """The MAC for a job's proxy hostname label."""
    digest = hmac.new(secret.encode('utf-8'),
                      f'job:{job_id}'.encode('utf-8'),
                      hashlib.sha256).digest()
    # base32 rather than hex: same DNS-safe alphabet cost, 25% fewer characters
    # per bit. Lowercased because hostnames are compared case-insensitively.
    return base64.b32encode(digest).decode('ascii').lower()[:_MAC_CHARS]


def service_host_label(job_id: int, secret: str) -> str:
    """The leftmost hostname label for a job's proxy URL, e.g. ``job-12-k7m2q9xr``."""
    return f'job-{job_id}-{_service_mac(job_id, secret)}'


def build_proxied_service_url(service_url: Optional[str], job_id: int,
                              proxy_domain: str, secret: str) -> Optional[str]:
    """Rewrite a published service URL to its HTTPS proxy form.

    Path, query and fragment are carried over verbatim: the query string holds
    the service's own access token, which remains the only credential.

    Returns None when there is nothing to rewrite, no proxy domain is
    configured, or no secret is available to sign the hostname with, in which
    case the caller should publish the URL unchanged.
    """
    if not service_url or not proxy_domain or not secret:
        return None
    parts = urlsplit(service_url)
    return urlunsplit((
        'https',
        f'{service_host_label(job_id, secret)}.{proxy_domain}',
        parts.path,
        parts.query,
        parts.fragment,
    ))


def job_id_from_host(host: Optional[str], proxy_domain: str,
                     secret: str) -> Optional[int]:
    """Extract the job id from a proxy hostname, or None if it isn't one.

    Matches the whole hostname, so neither a longer suffix
    (``job-1-k7m2q9xr.services.example.org.evil``) nor an extra label
    (``x.job-1-k7m2q9xr.services.example.org``) is accepted, and the label's MAC
    must verify against the id it carries.
    """
    if not host or not proxy_domain or not secret:
        return None
    # $host in nginx normally omits the port, but a client can send one.
    hostname = host.split(':', 1)[0].strip().lower()
    match = re.fullmatch(
        r'job-(\d{1,9})-([a-z2-7]{%d})\.' % _MAC_CHARS
        + re.escape(proxy_domain.lower()), hostname)
    if match is None:
        return None
    job_id = int(match.group(1))
    if not hmac.compare_digest(match.group(2), _service_mac(job_id, secret)):
        return None
    return job_id


def _is_ip_literal(host: str) -> bool:
    """Whether an upstream host is an IP address rather than a DNS name."""
    try:
        ipaddress.ip_address(host.strip().rstrip('.'))
        return True
    except ValueError:
        return False


def _host_matches_zone(host: str, allowed_zone: str) -> bool:
    """Whether an upstream host sits inside the configured allowed zone.

    Matching is on whole DNS labels, not raw text: a plain ``endswith`` would
    let ``evil-nodes.example.org`` satisfy a suffix of ``nodes.example.org``,
    which turns the allowlist into a prefix-guessing game the moment an
    operator omits the leading dot. Writing the suffix with or without that dot
    therefore means the same thing, and the zone's own name is allowed to be
    the upstream. A trailing root dot on either side is insignificant in DNS
    and is ignored here too.

    An IP literal is exempt rather than refused: it has no DNS zone to compare
    against, and some clusters publish a node's address instead of its name, so
    applying a zone here would silently break them. Literals are bounded by
    _is_safe_upstream_host instead.
    """
    if _is_ip_literal(host):
        return True
    zone = allowed_zone.lower().strip().rstrip('.').lstrip('.')
    if not zone:
        return True
    name = host.lower().rstrip('.')
    return name == zone or name.endswith('.' + zone)


@lru_cache(maxsize=8)
def _parse_networks(networks: tuple) -> tuple:
    """Parse CIDR strings once per distinct configuration, not per request.

    Entries are validated at startup, so anything unparseable here is dropped
    rather than raised: this runs on every proxied request, and a config error
    should have already stopped the server.
    """
    parsed = []
    for entry in networks:
        try:
            parsed.append(ipaddress.ip_network(entry.strip(), strict=False))
        except ValueError:
            continue
    return tuple(parsed)


def _host_in_networks(host: str, networks: Iterable[str]) -> bool:
    """Whether an upstream address falls inside one of the allowed networks.

    A hostname is exempt: there is no address to compare without a DNS lookup,
    which this path must not do. Names are governed by the zone check instead,
    so the two settings divide the space between them rather than overlapping.
    """
    allowed = _parse_networks(tuple(networks))
    if not allowed:
        return True
    try:
        addr = ipaddress.ip_address(host.strip().rstrip('.'))
    except ValueError:
        return True
    # Comparing across families raises, so pair each address with its own.
    return any(addr in net for net in allowed if net.version == addr.version)


def _is_safe_upstream_host(host: str) -> bool:
    """Reject upstreams that would aim the proxy at the Fileglancer host itself.

    The upstream comes from a file the user's own job wrote, and the reverse
    proxy dials it from the Fileglancer host rather than from the compute node.
    The privilege that must not be handed out is therefore narrow and specific:
    reaching a service that is *only* reachable from that host.

    In practice that means loopback and the unspecified address, which catch
    anything bound to localhost — the app server itself listens on
    127.0.0.1:8989 — plus link-local, which covers cloud instance-metadata
    endpoints. Multicast and reserved ranges are refused as well; they are not a
    threat, they are simply never a service.

    Private and public addresses are deliberately allowed. Some clusters publish
    a node's IP rather than its hostname, and an address bound to a routable
    interface is already reachable directly by any cluster user, so proxying to
    it grants nothing new. Blocking RFC 1918 would break real deployments to
    prevent nothing.

    Checks are textual and literal-only. Resolving a name here would mean a
    blocking DNS lookup on every proxied request; confining names to one zone is
    the job of service_proxy_upstream_zone.
    """
    name = host.lower().strip().rstrip('.')
    if name in _LOCAL_NAMES or name.endswith('.localhost'):
        return False
    try:
        addr = ipaddress.ip_address(name)
    except ValueError:
        return True  # A DNS name; bounded by the zone check when one is set.
    return not (
        addr.is_loopback or addr.is_unspecified or addr.is_link_local
        or addr.is_multicast or addr.is_reserved
    )


def upstream_from_service_url(service_url: Optional[str],
                              allowed_zone: str = "",
                              allowed_networks: Iterable[str] = ()) -> Optional[str]:
    """Extract a ``host:port`` upstream from a published service URL.

    Returns None unless the authority is exactly a hostname and an in-range
    port. The netloc regex is a header-injection gate — it constrains the
    authority's shape only, since the result is interpolated into the reverse
    proxy's ``proxy_pass`` target. The destination itself (where the proxy
    actually dials) is bounded separately: hosts that reach the Fileglancer host
    itself are rejected; ``allowed_zone``, when set, confines upstreams
    published as hostnames to one DNS zone; and ``allowed_networks``, when
    set, confines upstreams published as addresses to those CIDRs. The two
    allowlists divide the space rather than overlapping, since a bare address
    has no zone and a name has no address without a DNS lookup. All of this
    matters because the source string is a file written by the user's own job.
    """
    if not service_url:
        return None
    try:
        netloc = urlsplit(service_url).netloc
    except ValueError:
        return None
    match = _UPSTREAM_RE.fullmatch(netloc)
    if match is None:
        return None
    port = int(match.group(2))
    if not 1 <= port <= 65535:
        return None
    host = match.group(1)
    if not _is_safe_upstream_host(host):
        return None
    if allowed_zone and not _host_matches_zone(host, allowed_zone):
        return None
    if not _host_in_networks(host, allowed_networks):
        return None
    return netloc


# --- Resolution cache and counters ---
#
# The reverse proxy calls the resolve endpoint once per proxied HTTP request, so
# one JupyterLab page load is dozens of calls and a long WebSocket session keeps
# adding them. Without a cache each of those is a database round trip, and each
# one would also emit an access-log line carrying no information.
#
# Only successful resolutions are cached. A miss for a service that has not
# published its URL yet must stay a miss, or clicking "Open Service" the moment a
# service comes up would fail for the whole TTL.
#
# The TTL is deliberately short. It is the window during which a job that has
# stopped can still be proxied, and the RUNNING check it bypasses exists because
# compute-node ports get recycled. A page load's burst is sub-second, so a few
# seconds captures nearly all of the benefit while keeping that window small.
# Under `uvicorn --workers N` each worker keeps its own cache, so expect up to N
# misses per TTL rather than one; that is still bounded and small.
_RESOLVE_CACHE_TTL_SECONDS = 10
_RESOLVE_CACHE_MAX_ENTRIES = 1024
_RESOLVE_LOG_INTERVAL_SECONDS = 60

_resolve_cache = TTLCache(maxsize=_RESOLVE_CACHE_MAX_ENTRIES,
                          ttl=_RESOLVE_CACHE_TTL_SECONDS)
_resolve_counts = Counter()
_resolve_last_logged = 0.0


def cached_upstream(job_id: int) -> Optional[str]:
    """Return a recently resolved upstream for a job, or None to consult the DB."""
    return _resolve_cache.get(job_id)


def cache_upstream(job_id: int, upstream: str) -> None:
    """Remember a successful resolution for the cache's short TTL."""
    _resolve_cache[job_id] = upstream


def record_resolve(outcome: str) -> None:
    """Count one resolve outcome, and periodically log the running totals.

    Counting replaces per-request access logging for this endpoint: an aggregate
    every minute says the same thing as hundreds of individual lines, and says it
    in a form an operator can actually read. Outcomes are coarse on purpose —
    'hit', 'miss', and a refusal reason — so the line stays useful without
    naming any specific job.
    """
    global _resolve_last_logged
    _resolve_counts[outcome] += 1
    now = time.monotonic()
    if _resolve_last_logged == 0.0:
        # First call: start the clock rather than logging a one-request summary.
        _resolve_last_logged = now
        return
    if now - _resolve_last_logged < _RESOLVE_LOG_INTERVAL_SECONDS:
        return
    _resolve_last_logged = now
    totals = ' '.join(f'{name}={count}'
                      for name, count in sorted(_resolve_counts.items()))
    logger.info(f"service proxy resolve totals: {totals} "
                f"cached={len(_resolve_cache)}")


def reset_resolve_metrics() -> None:
    """Clear the cache and counters. For tests, and for nothing else."""
    global _resolve_last_logged
    _resolve_cache.clear()
    _resolve_counts.clear()
    _resolve_last_logged = 0.0


def resolve_counts() -> dict:
    """Snapshot of the outcome counters, for tests and diagnostics."""
    return dict(_resolve_counts)
