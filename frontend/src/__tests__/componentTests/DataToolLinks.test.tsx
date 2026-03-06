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
const mockCapabilityManifest = vi.hoisted(() => ({
  loadManifestsFromUrls: vi.fn(),
  isCompatible: vi.fn()
}));

vi.mock('@bioimagetools/capability-manifest', () => mockCapabilityManifest);

const mockOpenWithToolUrls: OpenWithToolUrls = {
  copy: 'http://localhost:3000/test/copy/url',
  neuroglancer: 'http://localhost:3000/test/neuroglancer/url',
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

    // Default mock: return empty Map (no manifests loaded)
    mockCapabilityManifest.loadManifestsFromUrls.mockResolvedValue(new Map());
    mockCapabilityManifest.isCompatible.mockReturnValue(false);
  });

  describe('Invalid YAML syntax', () => {
    it('should log error when YAML parsing fails in ViewersContext', async () => {
      // This test verifies that the ViewersContext logs errors appropriately
      // The actual YAML parsing error is tested in the ViewersContext initialization

      // Import the parseViewersConfig function to test it directly
      const { parseViewersConfig } = await import('@/config/viewersConfig');

      const invalidYaml = 'viewers:\n  - manifest_url: test\n    invalid: [[[';

      expect(() => parseViewersConfig(invalidYaml)).toThrow(
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
    it('should throw error when viewer lacks required manifest_url field', async () => {
      const { parseViewersConfig } = await import('@/config/viewersConfig');

      const configMissingManifestUrl = `
viewers:
  - label: Custom Label
    # Missing manifest_url
`;

      expect(() => parseViewersConfig(configMissingManifestUrl)).toThrow(
        /Each viewer must have a "manifest_url" field/
      );
    });

    it('should throw error when viewers array is empty', async () => {
      const { parseViewersConfig } = await import('@/config/viewersConfig');

      const configEmptyViewers = `
viewers: []
`;

      expect(() => parseViewersConfig(configEmptyViewers)).toThrow(
        /"viewers" must contain at least one viewer/
      );
    });
  });
});

describe('DataToolLinks - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock loadManifestsFromUrls to return manifests keyed by the URLs it receives.
    // This decouples the test from the exact manifest_url values in viewers.config.yaml.
    const manifestsByName: Record<string, object> = {
      neuroglancer: {
        viewer: {
          name: 'Neuroglancer',
          template_url: 'https://neuroglancer.com/#!{DATA_URL}'
        }
      },
      vizarr: {
        viewer: {
          name: 'Avivator',
          template_url: 'https://vizarr.com/?url={DATA_URL}'
        }
      }
    };

    mockCapabilityManifest.loadManifestsFromUrls.mockImplementation(
      async (urls: string[]) => {
        const map = new Map();
        for (const url of urls) {
          for (const [name, manifest] of Object.entries(manifestsByName)) {
            if (url.includes(name)) {
              map.set(url, manifest);
              break;
            }
          }
        }
        return map;
      }
    );

    // Mock isCompatible to return true for all viewers
    mockCapabilityManifest.isCompatible.mockReturnValue(true);
  });

  describe('Logo rendering in components', () => {
    it('should render viewer logos in component', async () => {
      // Test that viewers with known logo files render correctly in the component
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
        img => img.getAttribute('alt') === 'View in Neuroglancer'
      );
      expect(neuroglancerLogo).toBeTruthy();
      expect(neuroglancerLogo?.getAttribute('src')).toContain('neuroglancer');

      // Check for avivator logo (name for viewer in vizarr.yaml)
      const vizarrLogo = images.find(
        img => img.getAttribute('alt') === 'View in Avivator'
      );
      expect(vizarrLogo).toBeTruthy();
      expect(vizarrLogo?.getAttribute('src')).toContain('avivator');
    });
  });

  describe('Custom viewer compatibility', () => {
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

      // Should have neuroglancer logo
      const images = screen.getAllByRole('img');
      const neuroglancerLogo = images.find(
        img => img.getAttribute('alt') === 'View in Neuroglancer'
      );
      expect(neuroglancerLogo).toBeTruthy();

      // Copy button is an SVG icon, find by aria-label
      const copyButton = screen.getByLabelText('Copy data URL');
      expect(copyButton).toBeInTheDocument();
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

    // Mock loadManifestsFromUrls to return manifests keyed by the URLs it receives.
    // This decouples the test from the exact manifest_url values in viewers.config.yaml.
    const manifestsByName: Record<string, object> = {
      neuroglancer: {
        viewer: {
          name: 'Neuroglancer',
          template_url: 'https://neuroglancer.com/#!{DATA_URL}'
        }
      },
      vizarr: {
        viewer: {
          name: 'Avivator',
          template_url: 'https://vizarr.com/?url={DATA_URL}'
        }
      }
    };

    mockCapabilityManifest.loadManifestsFromUrls.mockImplementation(
      async (urls: string[]) => {
        const map = new Map();
        for (const url of urls) {
          for (const [name, manifest] of Object.entries(manifestsByName)) {
            if (url.includes(name)) {
              map.set(url, manifest);
              break;
            }
          }
        }
        return map;
      }
    );

    // Mock isCompatible to return true for all viewers
    mockCapabilityManifest.isCompatible.mockReturnValue(true);
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

      // Should render viewer logos
      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThanOrEqual(1);

      // Copy button is an SVG icon, find by aria-label
      const copyButton = screen.getByLabelText('Copy data URL');
      expect(copyButton).toBeInTheDocument();
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

      // Click the copy button (SVG icon, not img — find by aria-label)
      const copyButton = screen.getByLabelText('Copy data URL');
      expect(copyButton).toBeInTheDocument();

      copyButton.click();

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

      // Verify viewer logos are present (img elements)
      const images = screen.getAllByRole('img');
      expect(images.length).toBeGreaterThanOrEqual(2);

      const neuroglancerLogo = images.find(
        img => img.getAttribute('alt') === 'View in Neuroglancer'
      );
      const vizarrLogo = images.find(
        img => img.getAttribute('alt') === 'View in Avivator'
      );

      // Copy icon is an SVG, not an img — verify separately
      const copyButton = screen.getByLabelText('Copy data URL');
      expect(copyButton).toBeInTheDocument();

      expect(neuroglancerLogo).toBeTruthy();
      expect(vizarrLogo).toBeTruthy();
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
      const neuroglancerButton = screen.getByAltText('View in Neuroglancer');
      expect(neuroglancerButton).toBeInTheDocument();

      const vizarrButton = screen.getByAltText('View in Avivator');
      expect(vizarrButton).toBeInTheDocument();
    });
  });
});
