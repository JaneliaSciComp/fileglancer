import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode
} from 'react';
import {
  loadManifestsFromUrls,
  isCompatible,
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
  /** Associated capability manifest (required) */
  manifest: ViewerManifest;
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
 */
async function loadViewersConfig(): Promise<ViewerConfigEntry[]> {
  let configYaml: string;

  try {
    const module = await import('@/config/viewers.config.yaml?raw');
    configYaml = module.default;
    log.info(
      'Using custom viewers configuration from src/config/viewers.config.yaml'
    );
  } catch (error) {
    log.info(
      'No custom viewers.config.yaml found, using default configuration'
    );
    return [
      {
        manifest_url:
          'https://raw.githubusercontent.com/JaneliaSciComp/fileglancer/main/frontend/public/viewers/neuroglancer.yaml'
      }
    ];
  }

  try {
    const config = parseViewersConfig(configYaml);
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

export function ViewersProvider({
  children
}: {
  readonly children: ReactNode;
}) {
  const [validViewers, setValidViewers] = useState<ValidViewer[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function initialize() {
      try {
        log.info('Initializing viewers configuration...');

        // Load viewer config entries
        const configEntries = await loadViewersConfig();
        log.info(`Loaded configuration for ${configEntries.length} viewers`);

        // Extract manifest URLs
        const manifestUrls = configEntries.map(entry => entry.manifest_url);

        // Load capability manifests
        let manifestsMap: Map<string, ViewerManifest>;
        try {
          manifestsMap = await loadManifestsFromUrls(manifestUrls);
          log.info(`Loaded ${manifestsMap.size} viewer capability manifests`);
        } catch (manifestError) {
          log.error('Failed to load capability manifests:', manifestError);
          throw new Error(
            `Failed to load viewer manifests: ${manifestError instanceof Error ? manifestError.message : 'Unknown error'}`
          );
        }

        const validated: ValidViewer[] = [];

        // Map through viewer config entries to validate
        for (const entry of configEntries) {
          const manifest = manifestsMap.get(entry.manifest_url);

          if (!manifest) {
            log.warn(
              `Viewer manifest from "${entry.manifest_url}" failed to load, skipping`
            );
            continue;
          }

          // Determine URL template
          const urlTemplate =
            entry.instance_template_url ?? manifest.viewer.template_url;

          if (!urlTemplate) {
            log.warn(
              `Viewer "${manifest.viewer.name}" has no template_url in manifest and no instance_template_url override, skipping`
            );
            continue;
          }

          // Replace {DATA_URL} with {dataLink} for consistency with existing code
          const normalizedUrlTemplate = urlTemplate.replace(
            /{DATA_URL}/g,
            '{dataLink}'
          );

          // Create valid viewer entry
          const key = normalizeViewerName(manifest.viewer.name);
          const displayName = manifest.viewer.name;
          const label = entry.label || `View in ${displayName}`;
          const logoPath = getViewerLogo(manifest.viewer.name, entry.logo);

          validated.push({
            key,
            displayName,
            urlTemplate: normalizedUrlTemplate,
            logoPath,
            label,
            manifest
          });

          log.info(`Viewer "${manifest.viewer.name}" registered successfully`);
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
        log.error(
          'Application will continue with no viewers available. Check viewers.config.yaml for errors.'
        );
        setError(errorMessage);
        setValidViewers([]); // Ensure empty viewer list on error
        setIsInitialized(true); // Still mark as initialized to prevent hanging
      }
    }

    initialize();
  }, []);

  const getCompatibleViewers = useCallback(
    (metadata: OmeZarrMetadata): ValidViewer[] => {
      if (!isInitialized || !metadata) {
        return [];
      }

      return validViewers.filter(viewer =>
        isCompatible(viewer.manifest, metadata)
      );
    },
    [validViewers, isInitialized]
  );

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
