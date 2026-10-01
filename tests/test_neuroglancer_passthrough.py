import httpx
from fastapi.testclient import TestClient

import fileglancer.server as server_mod
from fileglancer.server import create_app
from fileglancer.settings import Settings


def _client(tmp_path, **settings_kwargs):
    settings = Settings(db_url=f"sqlite:///{tmp_path / 't.db'}", file_share_mounts=[],
                        cli_mode=True, **settings_kwargs)
    return TestClient(create_app(settings))


def _mock_upstream(monkeypatch, handler):
    seen = []

    def recording(request):
        seen.append(str(request.url))
        return handler(request)

    monkeypatch.setattr(server_mod, "_ng_http_client",
                        lambda: httpx.AsyncClient(transport=httpx.MockTransport(recording)))
    return seen


def test_no_passthrough_when_unset(tmp_path, monkeypatch):
    seen = _mock_upstream(monkeypatch, lambda r: httpx.Response(200, text="upstream"))
    resp = _client(tmp_path).get("/neuroglancer/")
    assert seen == []
    assert resp.text != "upstream"


def test_redirects_bare_path(tmp_path, monkeypatch):
    _mock_upstream(monkeypatch, lambda r: httpx.Response(200))
    client = _client(tmp_path, neuroglancer_url="https://ng.example/neuroglancer")
    resp = client.get("/neuroglancer", follow_redirects=False)
    assert resp.status_code in (307, 308)
    assert resp.headers["location"] == "/neuroglancer/"


def test_forwards_status_headers_and_joins_url(tmp_path, monkeypatch):
    def handler(request):
        if request.url.path.endswith("missing.js"):
            return httpx.Response(404, text="gone")
        return httpx.Response(200, text="fork", headers={"content-type": "text/html",
                                                          "cache-control": "max-age=60"})

    seen = _mock_upstream(monkeypatch, handler)
    client = _client(tmp_path, neuroglancer_url="https://ng.example/neuroglancer/")
    resp = client.get("/neuroglancer/")
    assert resp.status_code == 200 and resp.text == "fork"
    assert resp.headers["cache-control"] == "max-age=60"
    assert client.get("/neuroglancer/missing.js").status_code == 404
    assert seen == ["https://ng.example/neuroglancer/", "https://ng.example/neuroglancer/missing.js"]


def test_unreachable_upstream_is_502(tmp_path, monkeypatch):
    def handler(request):
        raise httpx.ConnectError("no route to host")

    _mock_upstream(monkeypatch, handler)
    client = _client(tmp_path, neuroglancer_url="https://ng.example/neuroglancer")
    resp = client.get("/neuroglancer/")
    assert resp.status_code == 502
    assert "ng.example" in resp.text


def test_stays_under_configured_prefix(tmp_path, monkeypatch):
    seen = _mock_upstream(monkeypatch, lambda r: httpx.Response(200, text="upstream"))
    client = _client(tmp_path, neuroglancer_url="https://ng.example/neuroglancer")
    # A literal "../" is collapsed by the client before sending; the encoded
    # forms reach the route decoded.
    for path in ("/neuroglancer/%2e%2e/api/secret", "/neuroglancer/a/%2e%2e%2f%2e%2e%2f",
                 "/neuroglancer/a%3Fq=1", "/neuroglancer/a%23frag"):
        assert client.get(path).status_code == 400, path
    assert seen == []


def test_rejects_double_encoded_dot_segments(tmp_path, monkeypatch):
    # uvicorn decodes the path once, so a client's %252e%252e reaches the route
    # as %2e%2e, which the upstream would decode and resolve. TestClient decodes
    # twice and can't produce this, so drive the ASGI app with the scope directly.
    import asyncio

    seen = _mock_upstream(monkeypatch, lambda r: httpx.Response(200, text="upstream"))
    settings = Settings(db_url=f"sqlite:///{tmp_path / 't.db'}", file_share_mounts=[],
                        cli_mode=True, neuroglancer_url="https://ng.example/neuroglancer")
    app = create_app(settings)
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
             "method": "GET", "scheme": "http", "path": "/neuroglancer/%2e%2e/api/secret",
             "raw_path": b"/neuroglancer/%252e%252e/api/secret", "root_path": "",
             "query_string": b"", "headers": [(b"host", b"testserver")],
             "client": ("127.0.0.1", 1), "server": ("testserver", 80)}
    sent = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        sent.append(message)

    asyncio.run(app(scope, receive, send))
    assert sent[0]["status"] == 400
    assert seen == []
