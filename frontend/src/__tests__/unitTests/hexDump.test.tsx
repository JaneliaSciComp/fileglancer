import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HexDump from '@/components/ui/BrowsePage/HexDump';

describe('HexDump', () => {
  it('renders offset, hex values, and ASCII representation', () => {
    // 0x50 0x4B = "PK" — ZIP magic bytes
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const { container } = render(<HexDump bytes={bytes} />);
    const pre = container.querySelector('pre')!;

    expect(pre.textContent).toContain('0000:');
    expect(pre.textContent).toContain('50');
    expect(pre.textContent).toContain('4B');
    expect(pre.textContent).toContain('PK');
  });

  it('uses uppercase hex for offset and byte values', () => {
    const bytes = new Uint8Array([0xab, 0xcd]);
    const { container } = render(<HexDump bytes={bytes} />);
    const pre = container.querySelector('pre')!;

    expect(pre.textContent).toContain('0000:');
    expect(pre.textContent).toContain('AB');
    expect(pre.textContent).toContain('CD');
    expect(pre.textContent).not.toContain('ab');
  });

  it('shows byte count when totalFileSize is not provided', () => {
    const bytes = new Uint8Array(4).fill(0);
    render(<HexDump bytes={bytes} />);
    expect(screen.getByText('4 bytes')).toBeInTheDocument();
  });

  it('shows byte count when totalFileSize equals bytes.length', () => {
    const bytes = new Uint8Array(4).fill(0);
    render(<HexDump bytes={bytes} totalFileSize={4} />);
    expect(screen.getByText('4 bytes')).toBeInTheDocument();
    expect(screen.queryByText(/Showing first/)).not.toBeInTheDocument();
  });

  it('shows truncation message when file is larger than the preview', () => {
    const bytes = new Uint8Array(512).fill(0);
    render(<HexDump bytes={bytes} totalFileSize={1024} />);
    expect(screen.getByText(/Showing first 512 of/)).toBeInTheDocument();
    expect(screen.getByText(/bytes/)).toBeInTheDocument();
  });

  it('replaces non-printable bytes with dots in the ASCII column', () => {
    // 0x01 = non-printable control char; 0x41 = 'A'; 0x42 = 'B'
    const bytes = new Uint8Array([0x01, 0x41, 0x42]);
    const { container } = render(<HexDump bytes={bytes} />);
    const pre = container.querySelector('pre')!;

    expect(pre.textContent).toContain('.AB');
  });

  it('replaces null bytes with dots in the ASCII column', () => {
    const bytes = new Uint8Array([0x00, 0x00]);
    const { container } = render(<HexDump bytes={bytes} />);
    const pre = container.querySelector('pre')!;

    expect(pre.textContent).toContain('..');
  });

  it('handles an empty byte array', () => {
    const bytes = new Uint8Array(0);
    render(<HexDump bytes={bytes} />);
    expect(screen.getByText('0 bytes')).toBeInTheDocument();
  });

  it('inserts a mid-row gap after the 8th byte', () => {
    const bytes = new Uint8Array(16).fill(0xab);
    const { container } = render(<HexDump bytes={bytes} />);
    const pre = container.querySelector('pre')!;
    const line = pre.textContent?.split('\n')[0] ?? '';

    // Eight hex bytes, then triple space (join + gap element + join), then the 9th byte
    expect(line).toContain('AB AB AB AB AB AB AB AB   AB');
  });

  it('produces the correct number of rows for multi-row input', () => {
    // 17 bytes → two rows (16 + 1)
    const bytes = new Uint8Array(17).fill(0);
    const { container } = render(<HexDump bytes={bytes} />);
    const pre = container.querySelector('pre')!;
    const lines = (pre.textContent ?? '').split('\n').filter(Boolean);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('0000:');
    expect(lines[1]).toContain('0010:');
  });

  it('pads the offset with leading zeros', () => {
    // 32 bytes → second row offset is 0x10 = 16, displayed as "0010"
    const bytes = new Uint8Array(32).fill(0);
    const { container } = render(<HexDump bytes={bytes} />);
    const pre = container.querySelector('pre')!;

    expect(pre.textContent).toContain('0010:');
  });
});
