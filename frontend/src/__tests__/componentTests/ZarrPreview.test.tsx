import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/__tests__/test-utils';
import useZarrMetadata from '@/hooks/useZarrMetadata';
import ZarrPreview from '@/components/ui/BrowsePage/ZarrPreview';

// Mock the omezarr-helper module to prevent actual zarr data loading
vi.mock('@/omezarr-helper', async () => {
  const { omezarrHelperMock } = await import('@/__tests__/mocks/omezarrHelper');
  return omezarrHelperMock;
});

// Test component that uses the actual useZarrMetadata hook
function ZarrPreviewTestWrapper() {
  const { availableVersions, layerType, openWithToolUrls, thumbnailQuery, zarrMetadataQuery } = useZarrMetadata();

  return (
    <ZarrPreview
      availableVersions={availableVersions}
      layerType={layerType}
      openWithToolUrls={openWithToolUrls}
      thumbnailQuery={thumbnailQuery}
      zarrMetadataQuery={zarrMetadataQuery}
    />
  );
}

describe('ZarrPreview version selector', () => {
  it('should not show version selector when only one version exists (v3 only)', async () => {
    render(<ZarrPreviewTestWrapper />, {
      initialEntries: ['/browse/test_fsp/my_folder/my_zarr']
    });

    // Wait for queries to resolve
    await waitFor(() => {
      expect(screen.queryByTestId('zarr-version-selector-container')).not.toBeInTheDocument();
    });
  });

  it('should not show version selector when only one version exists (v2 only)', async () => {
    render(<ZarrPreviewTestWrapper />, {
      initialEntries: ['/browse/test_fsp/my_folder/zarr_v2_only']
    });

    // Wait for queries to resolve
    await waitFor(() => {
      expect(screen.queryByTestId('zarr-version-selector-container')).not.toBeInTheDocument();
    });
  });

  it('should show version selector when multiple versions exist', async () => {
    render(<ZarrPreviewTestWrapper />, {
      initialEntries: ['/browse/test_fsp/my_folder/zarr_both_versions']
    });

    // Wait for version selector to appear
    await waitFor(() => {
      expect(screen.getByTestId('zarr-version-selector-container')).toBeInTheDocument();
    });
  });

  it('should default to v3 in version selector when both versions available', async () => {
    render(<ZarrPreviewTestWrapper />, {
      initialEntries: ['/browse/test_fsp/my_folder/zarr_both_versions']
    });

    // Wait for version selector to appear and v3 to be checked
    await waitFor(() => {
      const v3Radio = screen.getByLabelText('v3') as HTMLInputElement;
      expect(v3Radio).toBeChecked();
    });
  });
});
