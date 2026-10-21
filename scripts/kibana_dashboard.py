#!/usr/bin/env python3
"""Build (or rebuild) the Fileglancer usage dashboard in Kibana.

Generates Lens visualizations plus a dashboard as saved objects and imports
them with ``overwrite=true``, so re-running updates the dashboard in place.

Usage:

    # .env in the repo root with KIBANA_URL, KIBANA_USERNAME and KIBANA_PASSWORD
    pixi run python scripts/kibana_dashboard.py

KIBANA_URL is the space-scoped Kibana base URL (https://<host>/s/<space>).
Optional env: KIBANA_DATA_VIEW, REFERRER_HOSTS (comma-separated Label=host pairs
to break out in the referrer chart, e.g. "Fileglancer app=fg.example.org").
"""
import json
import os
import sys
from pathlib import Path

import httpx

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
for line in ENV_FILE.read_text().splitlines() if ENV_FILE.exists() else []:
    if "=" in line and not line.lstrip().startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip("'\""))

KIBANA_URL = os.environ.get("KIBANA_URL", "").rstrip("/")
DATA_VIEW = os.environ.get("KIBANA_DATA_VIEW", "filebeat-fileglancer")
REFERRER_HOSTS = [h.split("=", 1) for h in os.environ.get("REFERRER_HOSTS", "").split(",") if "=" in h]
ACCESS = 'event.dataset : "fileglancer.access"'
ACCESS_USERS = ACCESS + " and user.name : *"
APP_LOGS = 'not event.dataset : *access'
NGINX = 'event.dataset : "nginx.access"'

# --- Lens column builders -------------------------------------------------

def count(label="Requests", filter=None):
    c = {"label": label, "customLabel": True, "dataType": "number", "operationType": "count", "isBucketed": False,
         "scale": "ratio", "sourceField": "___records___", "params": {"emptyAsNull": False}}
    if filter:
        c["filter"] = {"query": filter, "language": "kuery"}
    return c

def metric(op, field, label, fmt=None, filter=None, **params):
    c = {"label": label, "customLabel": True, "dataType": "number", "operationType": op, "isBucketed": False,
         "scale": "ratio", "sourceField": field, "params": {"emptyAsNull": False, **params}}
    if fmt:
        c["params"]["format"] = {"id": fmt, "params": {"decimals": 1}}
    if filter:
        c["filter"] = {"query": filter, "language": "kuery"}
    return c

def last_seen():
    return {"label": "Last seen", "customLabel": True, "dataType": "date", "operationType": "max", "isBucketed": False,
            "scale": "ratio", "sourceField": "@timestamp", "params": {}}

def date_hist():
    return {"label": "@timestamp", "dataType": "date", "operationType": "date_histogram", "isBucketed": True,
            "scale": "interval", "sourceField": "@timestamp",
            "params": {"interval": "auto", "includeEmptyRows": True, "dropPartials": False}}

def terms(field, order_col, size=10, label=None, other=True, dtype="string"):
    return {"label": label or f"Top {field}", "customLabel": bool(label), "dataType": dtype, "operationType": "terms", "isBucketed": True,
            "scale": "ordinal", "sourceField": field,
            "params": {"size": size, "orderBy": {"type": "column", "columnId": order_col}, "orderDirection": "desc",
                       "otherBucket": other, "missingBucket": False, "parentFormat": {"id": "terms"},
                       "include": [], "exclude": [], "includeIsRegex": False, "excludeIsRegex": False}}

def filters(pairs, label="Category"):
    return {"label": label, "customLabel": True, "dataType": "string", "operationType": "filters", "isBucketed": True, "scale": "ordinal",
            "params": {"filters": [{"label": lbl, "input": {"query": q, "language": "kuery"}} for lbl, q in pairs]}}

# --- Lens saved-object builders ---------------------------------------------

def lens(id_, title, vis_type, columns, visualization, query):
    """columns: ordered dict of columnId -> column def."""
    layer = "layer1"
    return {
        # Without this the importer runs every 7.x Lens migration on the doc and 500s.
        "type": "lens", "id": id_, "typeMigrationVersion": "8.9.0", "coreMigrationVersion": "8.8.0",
        "attributes": {
            "title": title, "description": "", "visualizationType": vis_type,
            "state": {
                "datasourceStates": {"formBased": {"layers": {layer: {
                    "columns": columns, "columnOrder": list(columns), "incompleteColumns": {}}}}},
                "visualization": visualization,
                "query": {"query": query, "language": "kuery"},
                "filters": [], "adHocDataViews": {}, "internalReferences": [],
            },
        },
        "references": [{"type": "index-pattern", "id": DATA_VIEW, "name": f"indexpattern-datasource-layer-{layer}"}],
    }

def stat(id_, title, col, query=ACCESS):
    return lens(id_, title, "lnsMetric", {"m": col},
                {"layerId": "layer1", "layerType": "data", "metricAccessor": "m"}, query)

def xy(id_, title, series, cols, query, split=None, y=None, legend=True):
    y = y or [k for k, c in cols.items() if not c["isBucketed"]]
    vis = {"legend": {"isVisible": legend, "position": "right"}, "valueLabels": "hide", "fittingFunction": "Linear",
           "axisTitlesVisibilitySettings": {"x": False, "yLeft": False, "yRight": False},
           "tickLabelsVisibilitySettings": {"x": True, "yLeft": True, "yRight": True},
           "gridlinesVisibilitySettings": {"x": False, "yLeft": True, "yRight": False},
           "preferredSeriesType": series,
           "layers": [{"layerId": "layer1", "layerType": "data", "seriesType": series, "position": "top",
                       "showGridlines": False, "accessors": y, "xAccessor": "x",
                       **({"splitAccessor": split} if split else {})}]}
    return lens(id_, title, "lnsXY", cols, vis, query)

def table(id_, title, cols, query):
    return lens(id_, title, "lnsDatatable", cols,
                {"layerId": "layer1", "layerType": "data", "columns": [{"columnId": k} for k in cols],
                 "rowHeight": "single", "headerRowHeight": "single", "paging": {"size": 10, "enabled": True}},
                query)

def timeseries(id_, title, series, metric_cols, query, split_col=None):
    cols = {"x": date_hist()}
    if split_col:
        cols["s"] = split_col
    cols.update(metric_cols)
    return xy(id_, title, series, cols, query, split="s" if split_col else None, legend=bool(split_col) or len(metric_cols) > 1)

# --- Panels -----------------------------------------------------------------

P = "fg-"  # saved-object id prefix
objects = [
    stat(P + "users", "Active users", metric("unique_count", "user.name", "Active users"), ACCESS_USERS),
    stat(P + "requests", "Requests", count("Requests")),
    stat(P + "bytes", "Data served", metric("sum", "http.response.body.bytes", "Data served", fmt="bytes")),
    stat(P + "anon", "Anonymous data-link requests", count("Anonymous data-link requests", "not user.name : *")),
    stat(P + "errors", "Server errors (5xx)", count("Server errors (5xx)", "http.response.status_code >= 500")),

    timeseries(P + "req-by-user", "Requests over time by user", "bar_stacked", {"m": count()}, ACCESS_USERS,
               split_col=terms("user.name", "m", size=10, label="User")),
    timeseries(P + "active-users", "Active users over time", "line",
               {"m": metric("unique_count", "user.name", "Active users")}, ACCESS_USERS),
    timeseries(P + "req-by-area", "Requests by area", "area_stacked", {"m": count()}, ACCESS,
               split_col=filters([("Data links (/files)", "url.path : /files/*"),
                                  ("API", "url.path : /api/*"),
                                  ("UI / other", "not url.path : /files/* and not url.path : /api/*")], "Area")),

    table(P + "top-users", "Top users", {
        "u": terms("user.name", "n", size=25, label="User", other=False),
        "n": count(),
        "p": metric("unique_count", "url.path", "Distinct paths"),
        "b": metric("sum", "http.response.body.bytes", "Data served", fmt="bytes"),
        "l": last_seen(),
    }, ACCESS_USERS),
    timeseries(P + "status", "Response status over time", "bar_stacked", {"m": count()}, ACCESS,
               split_col=terms("http.response.status_code", "m", size=8, label="Status", dtype="number")),

    timeseries(P + "latency", "Time to first byte (ms)", "line", {
        "p50": metric("percentile", "event.duration_ms", "p50", percentile=50),
        "p95": metric("percentile", "event.duration_ms", "p95", percentile=95),
        "p99": metric("percentile", "event.duration_ms", "p99", percentile=99),
    }, ACCESS),
    timeseries(P + "bandwidth", "Data served over time", "bar",
               {"m": metric("sum", "http.response.body.bytes", "Bytes", fmt="bytes")}, ACCESS),

    xy(P + "browsers", "Browsers", "bar_horizontal",
       {"x": terms("user_agent.name", "m", size=8, label="Browser"), "m": count()}, ACCESS, legend=False),
    xy(P + "referrers", "Where requests come from (nginx referrer)", "bar_horizontal",
       {"x": filters([(label, rf"http.request.referrer : https\://{host}/*") for label, host in REFERRER_HOSTS] + [
                      ("neuroglancer-demo.appspot.com", r"http.request.referrer : https\://neuroglancer-demo.appspot.com/*"),
                      ("luxarviewer.dev", r"http.request.referrer : https\://luxarviewer.dev/*"),
                      ("localhost / dev", r"http.request.referrer : (http\://localhost* or http\://127.0.0.1* or http\://10.* or https\://10.*)"),
                      ("No referrer", "not http.request.referrer : *")], "Referrer"),
        "m": count()}, NGINX, legend=False),
    timeseries(P + "app-errors", "Application warnings & errors", "bar_stacked", {"m": count("Log lines")},
               APP_LOGS + " and log.level : (error or warning)",
               split_col=terms("log.logger", "m", size=8, label="Logger")),

    {
        "type": "search", "id": P + "recent-errors",
        "attributes": {
            "title": "Recent application errors", "description": "",
            "columns": ["log.level", "log.logger", "message"], "sort": [["@timestamp", "desc"]],
            "grid": {}, "hideChart": True, "isTextBasedQuery": False,
            "kibanaSavedObjectMeta": {"searchSourceJSON": json.dumps({
                "query": {"query": APP_LOGS + " and log.level : (error or warning)", "language": "kuery"},
                "filter": [], "indexRefName": "kibanaSavedObjectMeta.searchSourceJSON.index"})},
        },
        "references": [{"name": "kibanaSavedObjectMeta.searchSourceJSON.index", "type": "index-pattern", "id": DATA_VIEW}],
    },
]

# Layout: (id, x, y, w, h) on a 48-column grid.
layout = [
    ("users", 0, 0, 9, 6), ("requests", 9, 0, 9, 6), ("bytes", 18, 0, 10, 6), ("anon", 28, 0, 10, 6), ("errors", 38, 0, 10, 6),
    ("req-by-user", 0, 6, 48, 14),
    ("active-users", 0, 20, 24, 12), ("req-by-area", 24, 20, 24, 12),
    ("top-users", 0, 32, 24, 16), ("status", 24, 32, 24, 16),
    ("latency", 0, 48, 24, 12), ("bandwidth", 24, 48, 24, 12),
    ("browsers", 0, 60, 16, 12), ("referrers", 16, 60, 16, 12), ("app-errors", 32, 60, 16, 12),
    ("recent-errors", 0, 72, 48, 16),
]
types = {o["id"]: o["type"] for o in objects}
panels, refs = [], []
for i, (name, x, y, w, h) in enumerate(layout):
    pid = P + name
    panels.append({"version": "8.19.20", "type": types[pid], "gridData": {"x": x, "y": y, "w": w, "h": h, "i": str(i)},
                   "panelIndex": str(i), "panelRefName": f"panel_{i}",
                   # stat tiles already show their metric label; a panel title on top duplicates it
                   "embeddableConfig": {"enhancements": {}, **({"hidePanelTitles": True} if y == 0 else {})}})
    refs.append({"name": f"panel_{i}", "type": types[pid], "id": pid})

objects.append({
    "type": "dashboard", "id": P + "dashboard",
    "attributes": {
        "title": "Fileglancer usage",
        "description": "Who is using Fileglancer, when, and how. Latency is time to first byte, not full transfer.",
        "panelsJSON": json.dumps(panels),
        "optionsJSON": json.dumps({"useMargins": True, "syncColors": True, "syncCursor": True, "syncTooltips": True, "hidePanelTitles": False}),
        "timeRestore": True, "timeFrom": "now-7d", "timeTo": "now",
        "refreshInterval": {"pause": False, "value": 300000},
        "kibanaSavedObjectMeta": {"searchSourceJSON": json.dumps({"query": {"query": "", "language": "kuery"}, "filter": []})},
        "version": 1,
    },
    "references": refs,
})

# --- Import -----------------------------------------------------------------

if __name__ == "__main__":
    ndjson = "\n".join(json.dumps(o) for o in objects)
    if "--dump" in sys.argv:
        print(ndjson)
        sys.exit()
    missing = [k for k in ("KIBANA_URL", "KIBANA_USERNAME", "KIBANA_PASSWORD") if not os.environ.get(k)]
    if missing:
        sys.exit(f"Missing required environment variable(s): {', '.join(missing)} (set them in .env or the shell)")
    auth = (os.environ["KIBANA_USERNAME"], os.environ["KIBANA_PASSWORD"])
    r = httpx.post(f"{KIBANA_URL}/api/saved_objects/_import", params={"overwrite": "true"}, auth=auth,
                   headers={"kbn-xsrf": "true"}, files={"file": ("dashboard.ndjson", ndjson)}, verify=False, timeout=60)
    if r.status_code != 200:
        sys.exit(f"{r.status_code}: {r.text[:2000]}")
    res = r.json()
    for e in res.get("errors", []):
        print("ERROR", e["id"], json.dumps(e["error"]))
    print(f"imported {res['successCount']} objects, success={res['success']}")
    print(f"{KIBANA_URL}/app/dashboards#/view/{P}dashboard")
