import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/__tests__/test-utils';
import useZarrMetadata from '@/hooks/useZarrMetadata';
import ZarrMetadataTable from '@/components/ui/BrowsePage/ZarrMetadataTable';

// Mock the omezarr-helper module to prevent actual zarr data loading
vi.mock('@/omezarr-helper', async () => {
  const { omezarrHelperMock } = await import('@/__tests__/mocks/omezarrHelper');
  return omezarrHelperMock;
});

vi.mock('@/hooks/useZarrMetadata', async () => {
  const actual = (await vi.importActual(
    '@/hooks/useZarrMetadata'
  )) as typeof import('@/hooks/useZarrMetadata');
  return {
    default: () => {
      const actualResult = actual.default();
      return {
        ...actualResult,
        layerType: 'image'
      };
    }
  };
});

// Test component that uses the actual useZarrMetadata hook
function ZarrMetadataTableTestWrapper() {
  const { availableVersions, layerType, zarrMetadataQuery } = useZarrMetadata();

  // Don't render until we have metadata
  if (!zarrMetadataQuery.data?.metadata) {
    return null;
  }

  return (
    <ZarrMetadataTable
      availableVersions={availableVersions}
      layerType={layerType}
      metadata={zarrMetadataQuery.data.metadata}
    />
  );
}

describe('ZarrMetadataTable', () => {
  it('should display "v2, v3" when both versions are available', async () => {
    render(<ZarrMetadataTableTestWrapper />, {
      initialEntries: ['/browse/test_fsp/my_folder/ome_zarr_both_versions']
    });

    // Wait for the metadata table to render with version info
    await waitFor(() => {
      expect(screen.getByText('v2, v3')).toBeInTheDocument();
    });
  });

  it('should display single version when only v3 is available', async () => {
    render(<ZarrMetadataTableTestWrapper />, {
      initialEntries: ['/browse/test_fsp/my_folder/zarr_v3_only']
    });

    // Wait for the metadata table to render with version info
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  it('should display single version when only v2 is available', async () => {
    render(<ZarrMetadataTableTestWrapper />, {
      initialEntries: ['/browse/test_fsp/my_folder/zarr_v2_only']
    });

    // Wait for the metadata table to render with version info
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('should display OME-Zarr metadata title for multiscale data', async () => {
    render(<ZarrMetadataTableTestWrapper />, {
      initialEntries: ['/browse/test_fsp/my_folder/ome_zarr_both_versions']
    });

    // Wait for the metadata table to render
    await waitFor(() => {
      expect(screen.getByText('OME-Zarr Metadata')).toBeInTheDocument();
    });
  });

  it('should display Zarr Array metadata title for non-multiscale data', async () => {
    render(<ZarrMetadataTableTestWrapper />, {
      initialEntries: ['/browse/test_fsp/my_folder/zarr_both_versions']
    });

    // Wait for the metadata table to render
    await waitFor(() => {
      expect(screen.getByText('Zarr Array Metadata')).toBeInTheDocument();
    });
  });

  it('should display "Disabled" when disableHeuristicalLayerTypeDetection is true', async () => {
    // Override only the disableHeuristicalLayerTypeDetection preference for this test
    const { server } = await import('@/__tests__/mocks/node');
    const { http, HttpResponse } = await import('msw');

    server.use(
      http.get('/api/preference', () => {
        return HttpResponse.json({
          path: { value: ['linux_path'] },
          areDataLinksAutomatic: { value: false },
          disableHeuristicalLayerTypeDetection: { value: true },
          hideDotFiles: { value: false },
          disableNeuroglancerStateGeneration: { value: false },
          useLegacyMultichannelApproach: { value: false },
          isFilteredByGroups: { value: true },
          layout: { value: '' },
          zone: { value: [] },
          fileSharePath: { value: [] },
          folder: { value: [] },
          recentlyViewedFolders: { value: [] }
        });
      })
    );

    render(<ZarrMetadataTableTestWrapper />, {
      initialEntries: ['/browse/test_fsp/my_folder/ome_zarr_both_versions']
    });

    // Wait for the metadata table to render with "Disabled" in the Content row
    await waitFor(() => {
      expect(screen.getByText('Disabled')).toBeInTheDocument();
    });
  });

  it('should display detected layer type when disableHeuristicalLayerTypeDetection is false', async () => {
    render(<ZarrMetadataTableTestWrapper />, {
      initialEntries: ['/browse/test_fsp/my_folder/ome_zarr_both_versions']
    });

    // 'image' is returned by the mocked useZarrMetadata hook
    await waitFor(() => {
      expect(screen.getByText('image')).toBeInTheDocument();
    });
  });
});
