import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetadataHint from '@/components/ui/BrowsePage/MetadataHint';

describe('MetadataHint virtual-zarr', () => {
  it('shows a spinner while zarrbridge is busy', () => {
    render(
      <MetadataHint variant={{ case: 'virtual-zarr', state: 'indexing' }} />
    );
    expect(screen.getByTestId('zarrbridge-busy')).toBeInTheDocument();
    expect(screen.getByText('Reading image structure')).toBeInTheDocument();
  });

  it('shows progress while building', () => {
    render(
      <MetadataHint
        variant={{ case: 'virtual-zarr', state: 'building', progress: 0.42 }}
      />
    );
    expect(screen.getByText(/42% done/)).toBeInTheDocument();
  });

  it("explains an unindexed file with zarrbridge's reason", () => {
    render(
      <MetadataHint
        variant={{
          case: 'virtual-zarr',
          state: 'unindexed',
          reason: 'run zarrbridge index /x'
        }}
      />
    );
    expect(
      screen.getByText('Too large to index automatically')
    ).toBeInTheDocument();
    expect(screen.getByText(/run zarrbridge index \/x/)).toBeInTheDocument();
    expect(screen.queryByTestId('zarrbridge-busy')).toBeNull();
  });

  it('has no spinner in a terminal state', () => {
    render(
      <MetadataHint variant={{ case: 'virtual-zarr', state: 'native' }} />
    );
    expect(screen.queryByTestId('zarrbridge-busy')).toBeNull();
  });
});
