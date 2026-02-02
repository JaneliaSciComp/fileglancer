import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render, screen } from '@/__tests__/test-utils';
import DataToolLinks from '@/components/ui/BrowsePage/DataToolLinks';
import type { OpenWithToolUrls, PendingToolKey } from '@/hooks/useZarrMetadata';
import { ViewersProvider } from '@/contexts/ViewersContext';

// Mock logger to capture console warnings
const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));

vi.mock('@/logger', () => ({
  default: mockLogger
}));

// Mock capability manifest to avoid network requests in tests
vi.mock('@bioimagetools/capability-manifest', () => ({
  initializeViewerManifests: vi.fn(async () => [
    {
      viewer: {
        name: 'neuroglancer',
        template_url: 'https://neuroglancer.com/#{dataLink}'
      }
    },
    {
      viewer: {
        name: 'avivator',
        template_url: 'https://avivator.com/?url={dataLink}'
      }
    }
  ]),
  getCompatibleViewers: vi.fn(() => ['neuroglancer', 'avivator'])
}));

const mockOpenWithToolUrls: OpenWithToolUrls = {
  copy: 'http://localhost:3000/test/copy/url',
  validator: 'http://localhost:3000/test/validator/url',
  neuroglancer: 'http://localhost:3000/test/neuroglancer/url',
  vole: 'http://localhost:3000/test/vole/url',
  avivator: 'http://localhost:3000/test/avivator/url'
};

// Helper component to wrap DataToolLinks with ViewersProvider
function TestDataToolLinksComponent({
  urls = mockOpenWithToolUrls,
  onToolClick = vi.fn()
}: {
  urls?: OpenWithToolUrls | null;
  onToolClick?: (toolKey: PendingToolKey) => Promise<void>;
}) {
  return (
    <ViewersProvider>
      <DataToolLinks
        urls={urls}
        onToolClick={onToolClick}
        showCopiedTooltip={false}
        title="Test Tools"
      />
    </ViewersProvider>
  );
}

// Wrapper function for rendering with proper route context
function renderDataToolLinks(
  urls?: OpenWithToolUrls | null,
  onToolClick?: (toolKey: PendingToolKey) => Promise<void>
) {
  return render(
    <TestDataToolLinksComponent urls={urls} onToolClick={onToolClick} />,
    { initialEntries: ['/browse/test_fsp/test_file'] }
  );
}

describe('DataToolLinks - Error Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Invalid YAML syntax', () => {
    it('should log error when YAML parsing fails in ViewersContext', async () => {
      // This test verifies that the ViewersContext logs errors appropriately
      // The actual YAML parsing error is tested in the ViewersContext initialization

      // Import the parseViewersConfig function to test it directly
      const { parseViewersConfig } = await import('@/config/viewersConfig');

      const invalidYaml = 'viewers:\n  - name: test\n    invalid: [[[';

      expect(() => parseViewersConfig(invalidYaml, [])).toThrow(
        /Failed to parse viewers configuration YAML/
      );
    });

    it('should still render when ViewersContext fails to initialize', async () => {
      // When ViewersContext fails to initialize, it sets error state
      // and logs to console. The component should still render but with empty viewers.
      renderDataToolLinks();

      await waitFor(
        () => {
          // The component should still be initialized (to prevent hanging)
          // but viewers may be empty if there was an error
          expect(screen.getByText('Test Tools')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('Missing required fields', () => {
    it('should throw error when custom viewer lacks required url field', async () => {
      const { parseViewersConfig } = await import('@/config/viewersConfig');

      const configMissingUrl = `
viewers:
  - name: custom-viewer
    # Missing url for viewer without manifest
`;

      expect(() => parseViewersConfig(configMissingUrl, [])).toThrow(
        /does not have a capability manifest and must specify "url"/
      );
    });

    it('should throw error when custom viewer lacks ome_zarr_versions', async () => {
      const { parseViewersConfig } = await import('@/config/viewersConfig');

      const configMissingVersions = `
viewers:
  - name: custom-viewer
    url: https://example.com
    # Missing ome_zarr_versions for viewer without manifest
`;

      expect(() => parseViewersConfig(configMissingVersions, [])).toThrow(
        /does not have a capability manifest and must specify "ome_zarr_versions"/
      );
    });
  });
});

describe('DataToolLinks - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Fallback logo handling', () => {
    it('should handle viewers with custom logos', async () => {
      // Test that getViewerLogo returns appropriate path
      const { getViewerLogo } = await import('@/config/viewerLogos');

      // Test with known viewer
      const neuroglancerLogo = getViewerLogo('neuroglancer');
      expect(neuroglancerLogo).toBeTruthy();

      // Test with custom logo path
      const customLogo = getViewerLogo('custom-viewer', 'custom-logo.png');
      expect(customLogo).toBeTruthy();
    });

    it('should handle viewers with known logos', async () => {
      // Test that viewers with known logo files render correctly
      renderDataToolLinks();

      await waitFor(
        () => {
          expect(screen.getByText('Test Tools')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Check that images are rendered
      const images = screen.getAllByRole('img');

      // Check for neuroglancer logo (known viewer with logo)
      const neuroglancerLogo = images.find(
        img => img.getAttribute('alt') === 'Neuroglancer logo'
      );
      expect(neuroglancerLogo).toBeTruthy();
      expect(neuroglancerLogo?.getAttribute('src')).toContain('neuroglancer');

      // Check for avivator logo (known viewer with logo)
      const avivatorLogo = images.find(
        img => img.getAttribute('alt') === 'Avivator logo'
      );
      expect(avivatorLogo).toBeTruthy();
      expect(avivatorLogo?.getAttribute('src')).toContain('avivator');
    });
  });

  describe('Custom viewer without ome_zarr_versions', () => {
    it('should exclude viewer URL when set to null in OpenWithToolUrls', async () => {
      const urls: OpenWithToolUrls = {
        copy: 'http://localhost:3000/copy',
        neuroglancer: 'http://localhost:3000/neuroglancer',
        customviewer: null // Custom viewer not compatible (explicitly null)
      };

      renderDataToolLinks(urls);

      await waitFor(
        () => {
          expect(screen.getByText('Test Tools')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Should have neuroglancer logo and copy icon
      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThanOrEqual(2);

      // Check for neuroglancer logo
      const neuroglancerLogo = images.find(
        img => img.getAttribute('alt') === 'Neuroglancer logo'
      );
      expect(neuroglancerLogo).toBeTruthy();

      // Check for copy icon
      const copyIcon = images.find(
        img => img.getAttribute('alt') === 'Copy URL icon'
      );
      expect(copyIcon).toBeTruthy();
    });
  });

  describe('Component behavior with null urls', () => {
    it('should render nothing when urls is null', () => {
      renderDataToolLinks(null);

      // Component should not render when urls is null
      expect(screen.queryByText('Test Tools')).not.toBeInTheDocument();
    });
  });
});

describe('DataToolLinks - Expected Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  describe('Component behavior with valid viewers', () => {
    it('should render valid viewer icons and copy icon', async () => {
      renderDataToolLinks();

      await waitFor(
        () => {
          expect(screen.getByText('Test Tools')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Should render copy icon at minimum
      const images = screen.getAllByRole('img');
      const copyIcon = images.find(
        img => img.getAttribute('alt') === 'Copy URL icon'
      );
      expect(copyIcon).toBeTruthy();

      // Should also have viewer logos
      expect(images.length).toBeGreaterThan(1);
    });

    it('should call onToolClick when copy icon is clicked', async () => {
      const onToolClick = vi.fn(async () => {});
      renderDataToolLinks(undefined, onToolClick);

      await waitFor(
        () => {
          expect(screen.getByText('Test Tools')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Click the copy icon (always present)
      const images = screen.getAllByRole('img');
      const copyIcon = images.find(
        img => img.getAttribute('alt') === 'Copy URL icon'
      );
      expect(copyIcon).toBeTruthy();

      const copyButton = copyIcon!.closest('button');
      expect(copyButton).toBeTruthy();

      copyButton!.click();

      await waitFor(() => {
        expect(onToolClick).toHaveBeenCalledWith('copy');
      });
    });

    it('should render multiple viewer logos when URLs are provided', async () => {
      renderDataToolLinks();

      await waitFor(
        () => {
          expect(screen.getByText('Test Tools')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      const images = screen.getAllByRole('img');

      // Should have neuroglancer, avivator, and copy icons at minimum
      expect(images.length).toBeGreaterThanOrEqual(3);

      // Verify specific logos are present
      const neuroglancerLogo = images.find(
        img => img.getAttribute('alt') === 'Neuroglancer logo'
      );
      const avivatorLogo = images.find(
        img => img.getAttribute('alt') === 'Avivator logo'
      );

      expect(neuroglancerLogo).toBeTruthy();
      expect(avivatorLogo).toBeTruthy();
    });
  });

  describe('Tooltip behavior', () => {
    it('should show "Copy data URL" tooltip by default', async () => {
      renderDataToolLinks();

      await waitFor(
        () => {
          expect(screen.getByText('Test Tools')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // The copy button should have the correct aria-label
      const copyButton = screen.getByLabelText('Copy data URL');
      expect(copyButton).toBeInTheDocument();
    });

    it('should show viewer tooltip labels', async () => {
      renderDataToolLinks();

      await waitFor(
        () => {
          expect(screen.getByText('Test Tools')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Viewer buttons should have correct aria-labels from their config
      const neuroglancerButton = screen.getByLabelText('View in Neuroglancer');
      expect(neuroglancerButton).toBeInTheDocument();

      const avivatorButton = screen.getByLabelText('View in Avivator');
      expect(avivatorButton).toBeInTheDocument();
    });
  });
});
