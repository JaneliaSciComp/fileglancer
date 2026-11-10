import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetadataHint from '@/components/ui/BrowsePage/MetadataHint';
import type { ZarrbridgeStatus } from '@/queries/zarrQueries';

const status = (
  index: Partial<NonNullable<ZarrbridgeStatus['index']>>,
  pyramid: Partial<NonNullable<ZarrbridgeStatus['pyramid']>>,
  levels = 'native'
): ZarrbridgeStatus => ({
  levels: { state: levels },
  index: { state: 'none', bytes: null, reason: null, ...index },
  pyramid: {
    state: 'not_built',
    reason: null,
    progress: 0,
    eta_s: null,
    built: 0,
    planned: null,
    levels: null,
    bytes: 0,
    ...pyramid
  },
  cache: {
    mode: 'central',
    dir: '/c',
    bytes: 0,
    fingerprint: 'missing',
    mismatch: null,
    writable: true
  }
});

describe('MetadataHint virtual-zarr', () => {
  it('shows index and pyramid as two lines, index first, with the cache as a link', () => {
    render(
      <MetadataHint
        variant={{
          case: 'virtual-zarr',
          status: status(
            { state: 'saved', bytes: 34489268 },
            {
              reason:
                'The file is larger than the automatic build limit of 20 GiB.'
            }
          ),
          cacheHref: '/browse/home/.cache/zarrbridge/x'
        }}
      />
    );
    const text = screen.getByTestId('virtual-zarr-hint').textContent ?? '';
    expect(text.indexOf('Index:')).toBeGreaterThan(-1);
    expect(text.indexOf('Index:')).toBeLessThan(
      text.indexOf('Multiscale pyramid:')
    );
    expect(text).toContain('saved. 33 MB in your');
    expect(
      screen.getByRole('link', { name: 'personal cache' })
    ).toHaveAttribute('href', '/browse/home/.cache/zarrbridge/x');
    expect(text).toContain(
      'not built. Viewers read full resolution at every zoom level.'
    );
    expect(text).toContain(
      'The file is larger than the automatic build limit of 20 GiB.'
    );
    expect(text).not.toContain(';');
    expect(screen.queryByTestId('zarrbridge-busy')).toBeNull();
  });

  it('spins while reading the index and hides the pyramid line', () => {
    render(
      <MetadataHint
        variant={{
          case: 'virtual-zarr',
          status: status(
            {
              state: 'reading',
              reason: "Reading the file's structure. Gives up after 60 s."
            },
            {},
            'indexing'
          )
        }}
      />
    );
    expect(screen.getByTestId('zarrbridge-busy')).toBeInTheDocument();
    const text = screen.getByTestId('virtual-zarr-hint').textContent ?? '';
    expect(text).toContain("Index: reading. Reading the file's structure.");
    expect(text).not.toContain('Multiscale pyramid');
  });

  it('shows progress while building', () => {
    render(
      <MetadataHint
        variant={{
          case: 'virtual-zarr',
          status: status(
            { state: 'none' },
            { state: 'building', progress: 0.42 },
            'building'
          )
        }}
      />
    );
    expect(screen.getByTestId('zarrbridge-busy')).toBeInTheDocument();
    expect(screen.getByTestId('virtual-zarr-hint').textContent).toContain(
      'Multiscale pyramid: building, 42% done.'
    );
  });

  it('shows a failed index with its reason and no pyramid line', () => {
    render(
      <MetadataHint
        variant={{
          case: 'virtual-zarr',
          status: status(
            { state: 'failed', reason: 'Too big. Index it manually.' },
            {},
            'unindexed'
          )
        }}
      />
    );
    const text = screen.getByTestId('virtual-zarr-hint').textContent ?? '';
    expect(text).toContain('Index: failed. Too big. Index it manually.');
    expect(text).not.toContain('Multiscale pyramid');
    expect(screen.queryByTestId('zarrbridge-busy')).toBeNull();
  });

  it('reports a status fetch error', () => {
    render(
      <MetadataHint variant={{ case: 'virtual-zarr', error: 'HTTP 503' }} />
    );
    expect(
      screen.getByText('Virtual OME-Zarr status unavailable')
    ).toBeInTheDocument();
    expect(screen.getByText(/HTTP 503/)).toBeInTheDocument();
  });
});
