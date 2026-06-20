/**
 * Display helpers for the job detail page. All pure and unit-tested so the
 * Overview tab can stay declarative.
 */

/** Parse a backend timestamp (treated as UTC when no zone is present). */
function parseTimestamp(dateStr: string): number {
  let normalized = dateStr;
  if (!/Z$|[+-]\d{2}:\d{2}$/.test(dateStr)) {
    normalized = dateStr + 'Z';
  }
  return new Date(normalized).getTime();
}

/**
 * Human-readable duration between two timestamps. `end` defaults to now (for
 * still-running jobs). Returns null if either bound is missing/invalid.
 */
function formatDuration(
  start: string | null | undefined,
  end?: string | null | undefined
): string | null {
  if (!start) {
    return null;
  }
  const startMs = parseTimestamp(start);
  const endMs = end ? parseTimestamp(end) : Date.now();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return null;
  }
  const totalSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  // Always show seconds when the duration is under a minute, otherwise only
  // when non-zero, so short jobs don't render as an empty string.
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`);
  }
  return parts.join(' ');
}

/**
 * Strip the trailing LSF job-summary block from captured stdout/stderr.
 *
 * LSF appends an email-style report delimited by a line of dashes immediately
 * followed by a `Sender: LSF System` line, e.g.:
 *
 *   ------------------------------------------------------------
 *   Sender: LSF System <lsfadmin@h07u17>
 *   Subject: Job 151418022: <...> in cluster <Janelia> Done
 *
 * Conservative: if the marker isn't found, the text is returned unchanged.
 */
function stripLsfFooter(text: string): string {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (
      /^-{10,}\s*$/.test(lines[i]) &&
      /^Sender: LSF System\b/.test(lines[i + 1])
    ) {
      return lines.slice(0, i).join('\n').replace(/\s+$/, '');
    }
  }
  return text;
}

/** Return the last `n` lines of text, ignoring trailing blank lines. */
function tailLines(text: string, n: number): string {
  const lines = text.replace(/\s+$/, '').split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

/** Human-readable meaning for common process exit codes. */
function exitCodeMeaning(code: number | null | undefined): string | null {
  if (code === null || code === undefined) {
    return null;
  }
  switch (code) {
    case 0:
      return 'success';
    case 130:
      return 'interrupted (SIGINT)';
    case 137:
      return 'killed (SIGKILL / out of memory)';
    case 139:
      return 'segfault (SIGSEGV)';
    case 143:
      return 'terminated (SIGTERM)';
    default:
      return code > 128 ? `killed by signal ${code - 128}` : 'failed';
  }
}

export { formatDuration, stripLsfFooter, tailLines, exitCodeMeaning };
