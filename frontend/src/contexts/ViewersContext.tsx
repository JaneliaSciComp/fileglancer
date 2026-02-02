import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode
} from 'react';
import {
  initializeViewerManifests,
  getCompatibleViewers as getCompatibleViewersFromManifest,
  type ViewerManifest,
  type OmeZarrMetadata
} from '@bioimagetools/capability-manifest';
import { default as log } from '@/logger';
import {
  parseViewersConfig,
  type ViewerConfigEntry
} from '@/config/viewersConfig';
import { getViewerLogo } from '@/config/viewerLogos';

/**
 * Validated viewer with all necessary information
 */
export interface ValidViewer {
  /** Internal key for this viewer (normalized name) */
  key: string;
  /** Display name */
  displayName: string;
  /** URL template (may contain {dataLink} placeholder) */
  urlTemplate: string;
  /** Logo path */
  logoPath: string;
  /** Tooltip/alt text label */
  label: string;
  /** Associated capability manifest (if available) */
  manifest?: ViewerManifest;
  /** Supported OME-Zarr versions (for viewers without manifests) */
  supportedVersions?: number[];
}

interface ViewersContextType {
  validViewers: ValidViewer[];
  isInitialized: boolean;
  error: string | null;
  getCompatibleViewers: (metadata: OmeZarrMetadata) => ValidViewer[];
}

const ViewersContext = createContext<ViewersContextType | undefined>(undefined);

/**
 * Load viewers configuration from build-time config file
 * @param viewersWithManifests - Array of viewer names that have capability manifests
 */
async function loadViewersConfig(
  viewersWithManifests: string[]
): Promise<ViewerConfigEntry[]> {
  let configYaml: string;

  try {
    // Try to dynamically import the config file
    // This will be resolved at build time by Vite
    const module = await import('@/config/viewers.config.yaml?raw');
    configYaml = module.default;
    log.info(
      'Using custom viewers configuration from src/config/viewers.config.yaml'
    );
  } catch (error) {
    log.info(
      'No custom viewers.config.yaml found, using default configuration (neuroglancer only)'
    );
    // Return default configuration
    return [{ name: 'neuroglancer' }];
  }

  try {
    const config = parseViewersConfig(configYaml, viewersWithManifests);
    return config.viewers;
  } catch (error) {
    log.error('Error parsing viewers configuration:', error);
    throw error;
  }
}

/**
 * Normalize viewer name to a valid key
 */
function normalizeViewerName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function ViewersProvider({ children }: { children: ReactNode }) {
  const [validViewers, setValidViewers] = useState<ValidViewer[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manifests, setManifests] = useState<ViewerManifest[]>([]);

  useEffect(() => {
    async function initialize() {
      try {
        log.info('Initializing viewers configuration...');

        // Load capability manifests
        let loadedManifests: ViewerManifest[] = [];
        try {
          loadedManifests = await initializeViewerManifests();
          setManifests(loadedManifests);
          log.info(
            `Loaded ${loadedManifests.length} viewer capability manifests`
          );
        } catch (manifestError) {
          log.warn('Failed to load capability manifests:', manifestError);
        }

        const viewersWithManifests = loadedManifests.map(m => m.viewer.name);

        // Load viewer config entries
        const configEntries = await loadViewersConfig(viewersWithManifests);
        log.info(`Loaded configuration for ${configEntries.length} viewers`);

        const validated: ValidViewer[] = [];

        // Map through viewer config entries to validate
        for (const entry of configEntries) {
          const key = normalizeViewerName(entry.name);
          const manifest = loadedManifests.find(
            m => normalizeViewerName(m.viewer.name) === key
          );

          let urlTemplate: string | undefined = entry.url;
          let shouldInclude = true;
          let skipReason = '';

          if (manifest) {
            if (!urlTemplate) {
              // Use manifest template URL if no override
              urlTemplate = manifest.viewer.template_url;
            }

            if (!urlTemplate) {
              shouldInclude = false;
              skipReason = `has capability manifest but no template_url and no URL override in config`;
            }
          } else {
            // No capability manifest
            if (!urlTemplate) {
              shouldInclude = false;
              skipReason = `does not have a capability manifest and no URL provided in config`;
            }
          }

          if (!shouldInclude) {
            log.warn(`Viewer "${entry.name}" excluded: ${skipReason}`);
            continue;
          }

          // Create valid viewer entry
          const displayName =
            entry.name.charAt(0).toUpperCase() + entry.name.slice(1);
          const label = entry.label || `View in ${displayName}`;
          const logoPath = getViewerLogo(entry.name, entry.logo);

          validated.push({
            key,
            displayName,
            urlTemplate: urlTemplate!,
            logoPath,
            label,
            manifest,
            supportedVersions: entry.ome_zarr_versions
          });

          log.info(`Viewer "${entry.name}" registered successfully`);
        }

        if (validated.length === 0) {
          throw new Error(
            'No valid viewers configured. Check viewers.config.yaml or console for errors.'
          );
        }

        setValidViewers(validated);
        setIsInitialized(true);
        log.info(
          `Viewers initialization complete: ${validated.length} viewers available`
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        log.error('Failed to initialize viewers:', errorMessage);
        setError(errorMessage);
        setIsInitialized(true); // Still mark as initialized to prevent hanging
      }
    }

    initialize();
  }, []);

  const getCompatibleViewers = (metadata: OmeZarrMetadata): ValidViewer[] => {
    if (!isInitialized || !metadata) {
      return [];
    }

    return validViewers.filter(viewer => {
      if (viewer.manifest) {
        const compatibleNames = getCompatibleViewersFromManifest(metadata);
        return compatibleNames.includes(viewer.manifest.viewer.name);
      } else {
        // Manual version check for viewers without manifests
        const zarrVersion = metadata.version
          ? parseFloat(metadata.version)
          : null;
        if (zarrVersion === null || !viewer.supportedVersions) {
          return false;
        }
        return viewer.supportedVersions.includes(zarrVersion);
      }
    });
  };

  return (
    <ViewersContext.Provider
      value={{ validViewers, isInitialized, error, getCompatibleViewers }}
    >
      {children}
    </ViewersContext.Provider>
  );
}

export function useViewersContext() {
  const context = useContext(ViewersContext);
  if (!context) {
    throw new Error('useViewersContext must be used within ViewersProvider');
  }
  return context;
}
