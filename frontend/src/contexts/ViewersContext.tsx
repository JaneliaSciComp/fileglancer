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
  validateViewer,
  getLogoUrl,
  type ViewerManifest,
  type OmeZarrMetadata
} from '@bioimagetools/capability-manifest';
import { default as log } from '@/logger';
import { useViewersConfigQuery } from '@/queries/viewersConfigQueries';

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
  /**
   * The capability-manifest library's default template, before any instance
   * override from viewers.config. Empty string if the manifest has no
   * template_url. Used to let users opt back to the manifest default (e.g. the
   * external Neuroglancer at appspot) when a deployment overrides the URL.
   */
  manifestTemplateUrl: string;
  /** Logo path */
  logoPath: string;
  /** Tooltip/alt text label */
  label: string;
  /** Associated capability manifest (required) */
  manifest: ViewerManifest;
}

/** A configured viewer whose capability manifest rejected the dataset. */
export interface IncompatibleViewer {
  viewer: ValidViewer;
  /** Human-readable reasons from the capability check. */
  reasons: string[];
}

export interface ViewerCompatibility {
  compatible: ValidViewer[];
  incompatible: IncompatibleViewer[];
}

interface ViewersContextType {
  validViewers: ValidViewer[];
  isInitialized: boolean;
  error: string | null;
  getViewerCompatibility: (metadata: OmeZarrMetadata) => ViewerCompatibility;
}

const ViewersContext = createContext<ViewersContextType | undefined>(undefined);

/**
 * Normalize viewer name to a valid key
 */
function normalizeViewerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function ViewersProvider({
  children
}: {
  readonly children: ReactNode;
}) {
  const [validViewers, setValidViewers] = useState<ValidViewer[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data: configEntries,
    isError: isConfigError,
    error: configError
  } = useViewersConfigQuery();

  useEffect(() => {
    if (!configEntries) {
      return;
    }
    const entries = configEntries;

    async function loadManifests() {
      try {
        log.info(`Loaded configuration for ${entries.length} viewers`);

        // Extract manifest URLs
        const manifestUrls = entries.map(entry => entry.manifest_url);

        // Load capability manifests (with a 10s timeout to avoid hanging on unreachable URLs)
        let manifestsMap: Map<string, ViewerManifest>;
        try {
          const manifestsPromise = loadManifestsFromUrls(manifestUrls);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Manifest loading timed out after 10s')),
              10_000
            )
          );
          manifestsMap = await Promise.race([manifestsPromise, timeoutPromise]);
          log.info(`Loaded ${manifestsMap.size} viewer capability manifests`);
        } catch (manifestError) {
          throw new Error(
            `Failed to load viewer manifests: ${manifestError instanceof Error ? manifestError.message : 'Unknown error'}`
          );
        }

        const validated: ValidViewer[] = [];

        // Map through viewer config entries to validate
        for (const entry of entries) {
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
          const normalizeTemplate = (template: string) =>
            template.replace(/{DATA_URL}/g, '{dataLink}');
          const normalizedUrlTemplate = normalizeTemplate(urlTemplate);

          // The manifest's own default template (before any instance override),
          // normalized the same way. Empty string if the manifest has none.
          const manifestTemplateUrl = manifest.viewer.template_url
            ? normalizeTemplate(manifest.viewer.template_url)
            : '';

          // Create valid viewer entry
          const key = normalizeViewerName(manifest.viewer.name);
          const displayName = manifest.viewer.name;
          const label = entry.label || `View in ${displayName}`;
          const logoPath = getLogoUrl(manifest);

          validated.push({
            key,
            displayName,
            urlTemplate: normalizedUrlTemplate,
            manifestTemplateUrl,
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

    loadManifests();
  }, [configEntries]);

  // Handle query-level errors
  useEffect(() => {
    if (isConfigError && configError) {
      const errorMessage = configError.message;
      log.error('Failed to load viewers configuration:', errorMessage);
      setError(errorMessage);
      setIsInitialized(true);
    }
  }, [isConfigError, configError]);

  const getViewerCompatibility = useCallback(
    (metadata: OmeZarrMetadata): ViewerCompatibility => {
      const compatible: ValidViewer[] = [];
      const incompatible: IncompatibleViewer[] = [];
      if (!isInitialized || !metadata) {
        return { compatible, incompatible };
      }

      for (const viewer of validViewers) {
        const result = validateViewer(viewer.manifest, metadata);
        if (result.dataCompatible) {
          compatible.push(viewer);
        } else {
          const reasons = result.errors.map(e => e.message);
          log.info(
            `Viewer "${viewer.displayName}" is not compatible with this dataset: ${reasons.join('; ')}`
          );
          incompatible.push({ viewer, reasons });
        }
        if (result.warnings.length > 0) {
          log.info(
            `Viewer "${viewer.displayName}" warnings: ${result.warnings.map(w => w.message).join('; ')}`
          );
        }
      }
      return { compatible, incompatible };
    },
    [validViewers, isInitialized]
  );

  return (
    <ViewersContext.Provider
      value={{
        validViewers,
        isInitialized,
        error,
        getViewerCompatibility
      }}
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
