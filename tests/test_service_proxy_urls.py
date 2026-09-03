"""Tests for the pure URL helpers behind the app service HTTPS proxy."""

import re

import pytest

from fileglancer.apps.serviceproxy import (
    _MAC_CHARS,
    build_proxied_service_url,
    job_id_from_host,
    service_host_label,
    upstream_from_service_url,
)

DOMAIN = "services.example.org"
SECRET = "test-session-secret"


def _host(job_id, domain=DOMAIN):
    return f"{service_host_label(job_id, SECRET)}.{domain}"


# --- build_proxied_service_url ---

def test_build_swaps_scheme_and_host_keeping_path_and_query():
    """The query string carries $FG_SERVICE_TOKEN, so it must survive intact."""
    assert build_proxied_service_url(
        "http://node01:41235/lab?token=abc", 123, DOMAIN, SECRET
    ) == f"https://{_host(123)}/lab?token=abc"


def test_build_preserves_fragment():
    assert build_proxied_service_url(
        "http://node01:41235/vnc.html?autoconnect=true#top", 7, DOMAIN, SECRET
    ) == f"https://{_host(7)}/vnc.html?autoconnect=true#top"


def test_build_preserves_bare_root_url():
    assert build_proxied_service_url(
        "http://node01:41235", 7, DOMAIN, SECRET
    ) == f"https://{_host(7)}"


def test_build_returns_none_without_a_proxy_domain():
    """Empty domain is the off switch: callers fall back to the raw URL."""
    assert build_proxied_service_url("http://node01:41235/", 1, "", SECRET) is None


def test_build_returns_none_without_a_secret():
    """Nothing to sign the hostname with, so publish the raw URL rather than an
    unsigned, guessable one."""
    assert build_proxied_service_url("http://node01:41235/", 1, DOMAIN, "") is None


def test_build_returns_none_for_empty_service_url():
    assert build_proxied_service_url("", 1, DOMAIN, SECRET) is None
    assert build_proxied_service_url(None, 1, DOMAIN, SECRET) is None


# --- service_host_label ---

def test_host_label_is_short_and_dns_safe():
    """The label goes in a hostname and in front of users, so keep it small:
    job- + id + - + 8 base32 chars."""
    label = service_host_label(12, SECRET)
    assert re.fullmatch(r"job-12-[a-z2-7]{8}", label), label
    assert len(label) == 15


def test_host_label_differs_per_job_and_per_secret():
    assert service_host_label(1, SECRET) != service_host_label(2, SECRET)
    assert service_host_label(1, SECRET) != service_host_label(1, "other-secret")


# --- job_id_from_host ---

def test_job_id_from_host_extracts_id():
    assert job_id_from_host(_host(123), DOMAIN, SECRET) == 123


def test_job_id_from_host_strips_port_and_case():
    assert job_id_from_host(f"{_host(123).upper()}:443", DOMAIN, SECRET) == 123


def test_job_id_from_host_rejects_unsigned_and_mistyped_labels():
    """The point of the MAC: job ids are a small global sequence, so without it
    anyone who can reach the proxy could sweep job-1..job-500 for live
    services."""
    assert job_id_from_host(f"job-123.{DOMAIN}", DOMAIN, SECRET) is None
    assert job_id_from_host(f"job-123-{'a' * _MAC_CHARS}.{DOMAIN}",
                            DOMAIN, SECRET) is None
    # A valid label for another job does not authorize this one.
    label = service_host_label(124, SECRET).split("-", 2)[2]
    assert job_id_from_host(f"job-123-{label}.{DOMAIN}", DOMAIN, SECRET) is None


def test_job_id_from_host_rejects_a_label_signed_with_another_secret():
    assert job_id_from_host(
        f"{service_host_label(123, 'other-secret')}.{DOMAIN}",
        DOMAIN, SECRET) is None


@pytest.mark.parametrize("host", [
    "services.example.org",                    # no job label
    "job-.services.example.org",               # no digits
    "job-abc.services.example.org",            # not numeric
    "job-123.evil.example.org",                # wrong zone
    "job-123.services.example.org.evil",       # suffix attack
    "x.job-123.services.example.org",          # extra label
    "",
    None,
])
def test_job_id_from_host_rejects_bad_hosts(host):
    assert job_id_from_host(host, DOMAIN, SECRET) is None


def test_job_id_from_host_rejects_everything_without_a_domain():
    """Guards against an empty domain turning the pattern into a wildcard."""
    assert job_id_from_host(_host(123), "", SECRET) is None


def test_job_id_from_host_rejects_everything_without_a_secret():
    assert job_id_from_host(_host(123), DOMAIN, "") is None


def test_job_id_from_host_rejects_absurd_job_id():
    """An unbounded digit run used to reach int()'s 4300-digit limit and raise,
    turning a bogus hostname into a 500 with a traceback instead of a refusal."""
    assert job_id_from_host(
        f"job-{'9' * 5000}-{'a' * _MAC_CHARS}.{DOMAIN}", DOMAIN, SECRET) is None


# --- upstream_from_service_url ---

def test_upstream_extracts_host_and_port():
    assert upstream_from_service_url("http://node01:41235/lab?token=abc") == "node01:41235"


def test_upstream_accepts_fqdn():
    assert upstream_from_service_url("http://node01.cluster.example.org:8080/") == \
        "node01.cluster.example.org:8080"


@pytest.mark.parametrize("url", [
    "http://node01/lab",                     # no port: nothing to proxy to
    "http://user:pw@node01:41235/",          # userinfo
    "http://node01:41235x/",                 # non-numeric port
    "http://node01:99999/",                  # port out of range
    "http://node01:0/",                      # port 0
    "http://[::1]:8080/",                    # bracketed IPv6, unsupported upstream form
    "http://node01:8080\r\nX-Evil: 1/",      # header injection attempt
    "not a url",
    "",
])
def test_upstream_rejects_unproxyable_urls(url):
    """This is the header-injection gate: nginx interpolates the result straight
    into proxy_pass, so anything unexpected must yield None. It constrains the
    authority's shape only — see the loopback/link-local and allowlist tests
    below for what bounds the destination."""
    assert upstream_from_service_url(url) is None


@pytest.mark.parametrize("url", [
    "http://127.0.0.1:8989/",
    "http://127.1.2.3:8989/",
    "http://localhost:8989/",
    "http://LOCALHOST:8989/",
    "http://foo.localhost:8989/",
    "http://169.254.169.254:80/",
    "http://0.0.0.0:8080/",
    "http://224.0.0.1:8080/",
])
def test_upstream_rejects_hosts_aimed_at_the_web_tier(url):
    """The upstream comes from a file the user's job wrote and is dialed by the
    reverse proxy from the Fileglancer host, so a loopback or link-local target
    would reach services no cluster user can reach directly."""
    assert upstream_from_service_url(url) is None


def test_upstream_accepts_a_dns_name():
    assert upstream_from_service_url(
        "http://node01.nodes.example.org:41235/lab") == "node01.nodes.example.org:41235"


@pytest.mark.parametrize("host", [
    "10.0.0.1",        # RFC 1918 — where many clusters actually live
    "172.16.0.1",
    "192.168.1.1",
    "100.64.0.1",      # carrier-grade NAT
    "198.18.0.1",      # benchmarking
    "203.0.113.4",     # public
])
def test_upstream_accepts_node_ip_addresses(host):
    """Some clusters publish a node's address rather than its hostname. An
    address on a routable interface is already reachable directly by any cluster
    user, so proxying to it grants no new privilege — only hosts reachable
    *solely* from the Fileglancer host are refused."""
    assert upstream_from_service_url(f"http://{host}:41235/lab") == f"{host}:41235"


def test_upstream_zone_does_not_reject_an_ip_literal():
    """A literal has no zone to match, so applying one would break clusters that
    publish addresses. Literals stay bounded by the local-host checks instead."""
    assert upstream_from_service_url(
        "http://10.0.0.1:41235/", allowed_zone="nodes.example.org") == "10.0.0.1:41235"


def test_upstream_zone_allowlist_accepts_matching_host():
    assert upstream_from_service_url(
        "http://node01.nodes.example.org:41235/lab",
        allowed_zone=".nodes.example.org") == "node01.nodes.example.org:41235"


def test_upstream_zone_allowlist_rejects_other_hosts():
    assert upstream_from_service_url(
        "http://evil.example.org:41235/", allowed_zone=".nodes.example.org") is None


def test_upstream_zone_allowlist_is_case_insensitive():
    assert upstream_from_service_url(
        "http://NODE01.Nodes.Example.Org:41235/",
        allowed_zone=".nodes.example.org") == "NODE01.Nodes.Example.Org:41235"


@pytest.mark.parametrize("zone", [".nodes.example.org", "nodes.example.org"])
def test_upstream_zone_matches_on_label_boundaries(zone):
    """A plain endswith would let a sibling zone impersonate the allowed one, so
    an operator who omits the leading dot must not silently get a weaker check.
    Both spellings mean the same zone."""
    assert upstream_from_service_url(
        "http://node01.nodes.example.org:41235/", allowed_zone=zone) == \
        "node01.nodes.example.org:41235"
    assert upstream_from_service_url(
        "http://evil-nodes.example.org:41235/", allowed_zone=zone) is None


def test_upstream_zone_allows_the_zone_itself():
    assert upstream_from_service_url(
        "http://nodes.example.org:41235/",
        allowed_zone=".nodes.example.org") == "nodes.example.org:41235"


def test_upstream_zone_ignores_a_trailing_root_dot():
    """A trailing dot is insignificant in DNS, so it must not fail the check."""
    assert upstream_from_service_url(
        "http://node01.nodes.example.org.:41235/",
        allowed_zone=".nodes.example.org") == "node01.nodes.example.org.:41235"


def test_upstream_zone_still_rejects_an_unrelated_zone():
    assert upstream_from_service_url(
        "http://node01.other.example.org:41235/",
        allowed_zone="nodes.example.org") is None


# --- allowed_networks: the companion allowlist for address upstreams ---

NODE_NET = ("10.20.0.0/16",)


def test_networks_accept_an_address_inside_them():
    assert upstream_from_service_url(
        "http://10.20.3.4:41235/lab", allowed_networks=NODE_NET) == "10.20.3.4:41235"


def test_networks_reject_an_address_outside_them():
    assert upstream_from_service_url(
        "http://10.99.3.4:41235/lab", allowed_networks=NODE_NET) is None


def test_networks_exempt_hostnames():
    """A name has no address to compare without a DNS lookup, which this path
    must never do, so names are governed by the zone check instead."""
    assert upstream_from_service_url(
        "http://node01.nodes.example.org:41235/", allowed_networks=NODE_NET) == \
        "node01.nodes.example.org:41235"


def test_networks_empty_allows_any_address():
    assert upstream_from_service_url(
        "http://203.0.113.4:41235/", allowed_networks=()) == "203.0.113.4:41235"


def test_ipv6_upstreams_are_unreachable_regardless_of_networks():
    """An IPv6 upstream can never appear: the authority pattern forbids colons in
    the host, so neither bare nor bracketed literals survive the shape check.
    Configuring an IPv6 network therefore has nothing to match — asserted here so
    the limitation is recorded rather than rediscovered."""
    assert upstream_from_service_url("http://2001:db8::5:41235/") is None
    assert upstream_from_service_url("http://[2001:db8::5]:41235/") is None
    assert upstream_from_service_url(
        "http://2001:db8::5:41235/", allowed_networks=("2001:db8::/32",)) is None


def test_networks_do_not_raise_across_address_families():
    """Comparing an IPv4 address against an IPv6 network raises, so the check
    must pair each address with networks of its own family."""
    assert upstream_from_service_url(
        "http://10.20.3.4:41235/", allowed_networks=("2001:db8::/32",)) is None
    assert upstream_from_service_url(
        "http://10.20.3.4:41235/",
        allowed_networks=("2001:db8::/32", "10.20.0.0/16")) == "10.20.3.4:41235"


def test_networks_still_refuse_loopback_inside_an_allowed_range():
    """The always-refused set is not an allowlist opt-out: naming 127.0.0.0/8
    must not make the app server's own loopback dialable."""
    assert upstream_from_service_url(
        "http://127.0.0.1:8989/", allowed_networks=("127.0.0.0/8",)) is None
