#!/usr/bin/env bash
# Probe the server side of the stale-file-viewer bug without a browser.
#
# Prints, for one file: what the edit host sees, what the Fileglancer server
# host sees (if FG_SSH_HOST is set), and the headers + body stamp returned by
# GET /api/content through the production URL (nginx + fileglancer).
#
# Usage:
#   FG_URL=https://fileglancer.example.org \
#   FG_TOKEN=<api token from Preferences> \
#   FG_FSP=<file share path name as it appears in the browse URL> \
#   FG_SUBPATH=path/under/the/fsp/.zattrs \
#   LOCAL_PATH=/groups/.../.zattrs \
#   FG_SSH_HOST=<fileglancer server host, optional> \
#   scripts/stale-viewer-curl-probe.sh [repeat_count] [sleep_seconds]
#
# Run it once before the edit, then edit the file, then run it with e.g.
# `30 10` to poll for five minutes. Paste the output into the issue or PR.
set -euo pipefail

: "${FG_URL:?}" "${FG_TOKEN:?}" "${FG_FSP:?}" "${FG_SUBPATH:?}" "${LOCAL_PATH:?}"
repeat="${1:-1}"
pause="${2:-10}"

probe() {
  echo "=== $(date -Is) ==="
  echo "--- edit host: stat + md5"
  stat -c 'mtime=%y size=%s' "$LOCAL_PATH"
  md5sum "$LOCAL_PATH"
  if [ -n "${FG_SSH_HOST:-}" ]; then
    echo "--- fileglancer host ($FG_SSH_HOST): stat + md5 (NFS view there)"
    ssh "$FG_SSH_HOST" "stat -c 'mtime=%y size=%s' '$LOCAL_PATH'; md5sum '$LOCAL_PATH'"
  fi
  echo "--- GET /api/content via $FG_URL (bypasses the browser)"
  # -D - dumps headers; body md5 is compared with the on-disk md5 above.
  curl -sS -D /dev/stderr -o /tmp/fg-probe-body \
    -H "Authorization: Bearer $FG_TOKEN" \
    -H "Cache-Control: no-cache" \
    "$FG_URL/api/content/$FG_FSP?subpath=$FG_SUBPATH" 2>&1 \
    | grep -i -E '^(HTTP/|date:|last-modified:|etag:|cache-control:|age:|via:|x-cache|x-proxy-cache|server:)'
  echo "body: $(md5sum < /tmp/fg-probe-body)"
  echo
}

for ((i = 0; i < repeat; i++)); do
  probe
  [ "$i" -lt $((repeat - 1)) ] && sleep "$pause"
done
