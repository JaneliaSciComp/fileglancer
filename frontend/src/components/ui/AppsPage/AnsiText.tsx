import { useMemo } from 'react';

import { Card } from '@material-tailwind/react';
import {
  materialDark,
  coy
} from 'react-syntax-highlighter/dist/esm/styles/prism';

// Standard ANSI 8-color palette (codes 30-37 foreground, 40-47 background)
const ANSI_COLORS = [
  '#000000', // 0 black
  '#cc0000', // 1 red
  '#4e9a06', // 2 green
  '#c4a000', // 3 yellow
  '#3465a4', // 4 blue
  '#75507b', // 5 magenta
  '#06989a', // 6 cyan
  '#d3d7cf' // 7 white
];

const ANSI_BRIGHT_COLORS = [
  '#555753', // 0 bright black
  '#ef2929', // 1 bright red
  '#8ae234', // 2 bright green
  '#fce94f', // 3 bright yellow
  '#729fcf', // 4 bright blue
  '#ad7fa8', // 5 bright magenta
  '#34e2e2', // 6 bright cyan
  '#eeeeec' // 7 bright white
];

interface Segment {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

// Parse ANSI escape sequences into styled segments
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[([0-9;]*)m/g;

function parseAnsi(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let color: string | undefined;
  let bold = false;
  let dim = false;

  // Replace escape sequences represented as literal characters
  const normalized = text.replace(
    /\[(\d+(?:;\d+)*)m/g,
    (match, codes, offset) => {
      // Only treat as ANSI if at start of line or preceded by whitespace/dash/newline
      const prev = text[offset - 1];
      if (offset === 0 || prev === '\n' || prev === '-' || prev === ' ') {
        return `\x1b[${codes}m`;
      }
      return match;
    }
  );

  let m;
  ANSI_REGEX.lastIndex = 0;
  while ((m = ANSI_REGEX.exec(normalized)) !== null) {
    if (m.index > lastIndex) {
      segments.push({
        text: normalized.slice(lastIndex, m.index),
        color,
        bold,
        dim
      });
    }
    lastIndex = m.index + m[0].length;

    const codes = m[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0) {
        color = undefined;
        bold = false;
        dim = false;
      } else if (code === 1) {
        bold = true;
      } else if (code === 2) {
        dim = true;
      } else if (code >= 30 && code <= 37) {
        color = bold ? ANSI_BRIGHT_COLORS[code - 30] : ANSI_COLORS[code - 30];
      } else if (code >= 90 && code <= 97) {
        color = ANSI_BRIGHT_COLORS[code - 90];
      }
    }
  }

  if (lastIndex < normalized.length) {
    segments.push({ text: normalized.slice(lastIndex), color, bold, dim });
  }

  return segments;
}

interface AnsiTextProps {
  readonly content: string;
  readonly isDarkMode: boolean;
}

function AnsiText({ content, isDarkMode }: AnsiTextProps) {
  const theme = isDarkMode ? materialDark : coy;
  const preStyles = theme['pre[class*="language-"]'] || {};
  const codeStyles = theme['code[class*="language-"]'] || {};

  const segments = useMemo(() => parseAnsi(content), [content]);

  return (
    <Card className="overflow-hidden dark:border-surface-light">
      <pre
        style={{
          margin: 0,
          padding: '1rem',
          fontSize: '14px',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          background:
            preStyles.background || (isDarkMode ? '#263238' : '#fafafa'),
          color: codeStyles.color || (isDarkMode ? '#ccc' : '#333'),
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
        }}
      >
        <code>
          {segments.map((seg, i) => {
            if (!seg.color && !seg.bold && !seg.dim) {
              return seg.text;
            }
            return (
              <span
                key={i}
                style={{
                  color: seg.color,
                  fontWeight: seg.bold ? 'bold' : undefined,
                  opacity: seg.dim ? 0.6 : undefined
                }}
              >
                {seg.text}
              </span>
            );
          })}
        </code>
      </pre>
    </Card>
  );
}

export default AnsiText;
