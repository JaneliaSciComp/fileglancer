/**
 * Flatten markdown to a one-line plain-text summary for list views (e.g. the
 * entry point cards). Block constructs with no sensible inline form (tables,
 * fenced code) are dropped; inline markup is unwrapped. Single * / _ are left
 * alone so globs and snake_case names survive.
 */
export function summarizeMarkdown(text: string, maxLength = 200): string {
  const lines: string[] = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || /^\s*\|/.test(line)) {
      continue;
    }
    lines.push(line.replace(/^\s*#{1,6}\s+/, ''));
  }
  const plain = lines
    .join(' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= maxLength) {
    return plain;
  }
  const cut = plain.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}
