import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { default as log } from '@/logger';
import {
  getOmeZarrMetadata,
  getOmeZarrThumbnail,
  getZarrArray
} from '@/omezarr-helper';
import type { Metadata } from '@/omezarr-helper';
import { getFileURL } from '@/utils';
import { fetchFileAsJson } from './queryUtils';
import { isOzxFile } from '@/utils/ozxDetection';
import {
  OzxFetchStore,
  getZipContentUrl,
  useZipFileListQuery
} from './ozxQueries';
import type { FileOrFolder } from '@/shared.types';

export type OpenWithToolUrls = {
  copy: string;
  validator: string | null;
  neuroglancer: string;
  vole: string | null;
  avivator: string | null;
};

export type ZarrMetadata = Metadata | null;

type ZarrMetadataQueryParams = {
  fspName: string | undefined;
  currentFileOrFolder: FileOrFolder | undefined | null;
  files: FileOrFolder[] | undefined;
};

type ZarrMetadataResult = {
  metadata: ZarrMetadata;
  omeZarrUrl: string | null;
  availableVersions: ('v2' | 'v3')[];
};

// Zarr v3 zarr.json structure
type ZarrV3Attrs = {
  node_type: 'array' | 'group';
  attributes?: {
    ome?: {
      multiscales?: unknown;
      labels?: string[];
    };
  };
};

// Zarr v2 .zattrs structure
type ZarrV2Attrs = {
  multiscales?: unknown;
  labels?: string[];
};

/**
 * Detects which Zarr versions are supported by checking for version-specific marker files.
 * @returns Array of supported versions: ['v2'], ['v3'], or ['v2', 'v3']
 */
export function detectZarrVersions(files: FileOrFolder[]): ('v2' | 'v3')[] {
  if (!files || files.length === 0) {
    return [];
  }

  const hasFile = (name: string) => files.some(f => f.name === name);
  const versions: ('v2' | 'v3')[] = [];

  // Check for Zarr v2 indicators
  if (hasFile('.zarray') || hasFile('.zattrs')) {
    versions.push('v2');
  }

  // Check for Zarr v3 indicator
  if (hasFile('zarr.json')) {
    versions.push('v3');
  }

  return versions;
}

/**
 * Fetches Zarr metadata by checking for zarr.json, .zarray, or .zattrs files
 */
async function fetchZarrMetadata({
  fspName,
  currentFileOrFolder,
  files
}: ZarrMetadataQueryParams): Promise<ZarrMetadataResult> {
  if (!fspName || !currentFileOrFolder || !files) {
    log.warn('Missing required parameters for Zarr metadata fetch');
    return {
      metadata: null,
      omeZarrUrl: null,
      availableVersions: []
    };
  }

  const imageUrl = getFileURL(fspName, currentFileOrFolder.path);

  // Helper to find file by name
  const getFile = (fileName: string) =>
    files.find((file: FileOrFolder) => file.name === fileName);

  const availableVersions = detectZarrVersions(files);

  // Default to Zarr v3 when available
  if (availableVersions.includes('v3')) {
    const zarrJsonFile = getFile('zarr.json') as FileOrFolder;
    const attrs = (await fetchFileAsJson(
      fspName,
      zarrJsonFile.path
    )) as ZarrV3Attrs;

    if (attrs.node_type === 'array') {
      log.info('Getting Zarr array for', imageUrl, 'with Zarr version', 3);
      const arr = await getZarrArray(imageUrl, 3);
      const shapes = [arr.shape];
      return {
        metadata: {
          arr,
          shapes,
          multiscale: undefined,
          scales: undefined,
          omero: undefined,
          labels: undefined,
          zarrVersion: 3
        },
        omeZarrUrl: null,
        availableVersions
      };
    } else if (attrs.node_type === 'group') {
      if (attrs.attributes?.ome?.multiscales) {
        log.info(
          'Getting OME-Zarr metadata for',
          imageUrl,
          'with Zarr version',
          3
        );
        const metadata = await getOmeZarrMetadata(imageUrl);
        // Check for labels
        try {
          const labelsAttrs = (await fetchFileAsJson(
            fspName,
            currentFileOrFolder.path + '/labels/zarr.json'
          )) as ZarrV3Attrs;
          metadata.labels = labelsAttrs?.attributes?.ome?.labels;
          if (metadata.labels) {
            log.info('OME-Zarr Labels found: ', metadata.labels);
          }
        } catch (error) {
          log.trace('Could not fetch labels attrs: ', error);
        }
        return {
          metadata,
          omeZarrUrl: imageUrl,
          availableVersions
        };
      } else {
        log.info('Zarrv3 group has no multiscales', attrs.attributes);
        return {
          metadata: null,
          omeZarrUrl: null,
          availableVersions
        };
      }
    } else {
      log.warn('Unknown Zarrv3 node type', attrs.node_type);
      return {
        metadata: null,
        omeZarrUrl: null,
        availableVersions
      };
    }
    // v3 not available, now check for v2
  } else {
    // v2 present
    if (availableVersions.includes('v2')) {
      const zarrayFile = getFile('.zarray');
      const zattrsFile = getFile('.zattrs');

      // Check for .zarray (Zarr v2 array)
      if (zarrayFile) {
        log.info('Getting Zarr array for', imageUrl, 'with Zarr version', 2);
        const arr = await getZarrArray(imageUrl, 2);
        const shapes = [arr.shape];
        return {
          metadata: {
            arr,
            shapes,
            multiscale: undefined,
            scales: undefined,
            omero: undefined,
            labels: undefined,
            zarrVersion: 2
          },
          omeZarrUrl: null,
          availableVersions
        };
        // Check for .zattrs (Zarr v2 OME-Zarr)
      } else if (zattrsFile) {
        const attrs = (await fetchFileAsJson(
          fspName,
          zattrsFile.path
        )) as ZarrV2Attrs;
        if (attrs.multiscales) {
          log.info(
            'Getting OME-Zarr metadata for',
            imageUrl,
            'with Zarr version',
            2
          );
          const metadata = await getOmeZarrMetadata(imageUrl);
          // Check for labels
          try {
            const labelsAttrs = (await fetchFileAsJson(
              fspName,
              currentFileOrFolder.path + '/labels/.zattrs'
            )) as ZarrV2Attrs;
            metadata.labels = labelsAttrs?.labels;
            if (metadata.labels) {
              log.info('OME-Zarr Labels found: ', metadata.labels);
            }
          } catch (error) {
            log.trace('Could not fetch labels attrs: ', error);
          }
          return {
            metadata,
            omeZarrUrl: imageUrl,
            availableVersions
          };
        } else {
          log.debug('Zarrv2 .zattrs has no multiscales', attrs);
          return {
            metadata: null,
            omeZarrUrl: null,
            availableVersions
          };
        }
        // No Zarr metadata found
      } else {
        log.debug('No Zarr metadata files found for', imageUrl);
        return {
          metadata: null,
          omeZarrUrl: null,
          availableVersions
        };
      }
      // No Zarr metadata found
    } else {
      log.debug('No supported Zarr versions detected for', imageUrl);
      return {
        metadata: null,
        omeZarrUrl: null,
        availableVersions: []
      };
    }
  }
}

/**
 * Hook to fetch Zarr metadata for the current file/folder
 */
export function useZarrMetadataQuery(
  params: ZarrMetadataQueryParams
): UseQueryResult<ZarrMetadataResult, Error> {
  const { fspName, currentFileOrFolder, files } = params;

  return useQuery({
    queryKey: [
      'zarr',
      'metadata',
      fspName || '',
      currentFileOrFolder?.path || ''
    ],
    queryFn: async () => await fetchZarrMetadata(params),
    enabled:
      !!fspName &&
      !!currentFileOrFolder &&
      !!files &&
      files.length > 0 &&
      detectZarrVersions(files).length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes - Zarr metadata doesn't change often
    retry: false // Don't retry if no Zarr files found
  });
}

async function fetchOmeZarrThumbnail(
  omeZarrUrl: string,
  signal: AbortSignal
): Promise<string> {
  log.debug('Getting OME-Zarr thumbnail for', omeZarrUrl);

  const [thumbnail, errorMessage] = await getOmeZarrThumbnail(
    omeZarrUrl,
    signal
  );

  if (errorMessage) {
    throw new Error(errorMessage);
  } else if (!thumbnail) {
    throw new Error('Unknown error: Thumbnail not generated');
  }

  return thumbnail;
}

/**
 * Hook to fetch OME-Zarr thumbnail
 */
export function useOmeZarrThumbnailQuery(
  omeZarrUrl: string | null
): UseQueryResult<string, Error> {
  return useQuery({
    queryKey: ['zarr', 'thumbnail', omeZarrUrl || ''],
    queryFn: async ({ signal }) => {
      if (!omeZarrUrl) {
        throw new Error('omeZarrUrl is required for thumbnail generation');
      }
      return await fetchOmeZarrThumbnail(omeZarrUrl, signal);
    },
    enabled: !!omeZarrUrl,
    staleTime: 30 * 60 * 1000, // 30 minutes - thumbnails are expensive to generate
    retry: false
  });
}

// OZX (Zipped OME-Zarr) types
type OzxZarrMetadataQueryParams = {
  fspName: string | undefined;
  ozxFile: FileOrFolder | undefined | null;
};

type OzxZarrMetadataResult = {
  metadata: ZarrMetadata;
  omeZarrUrl: string | null;
  availableVersions: ('v2' | 'v3')[];
  store: OzxFetchStore | null;
};

/**
 * Detects if an OZX archive contains Zarr v3 data.
 * RFC-9 OZX files are specifically for OME-Zarr v0.5 which requires Zarr v3.
 * @param files - Array of file paths within the OZX archive
 * @returns Array containing ['v3'] if zarr.json found, empty array otherwise
 */
export function detectOzxZarrVersions(files: string[]): 'v3'[] {
  if (!files || files.length === 0) {
    return [];
  }

  // RFC-9 OZX is for OME-Zarr v0.5 which is Zarr v3 only
  // Check for zarr.json at root or in subdirectories
  const hasZarrJson = files.some(
    f => f === 'zarr.json' || f.endsWith('/zarr.json')
  );

  return hasZarrJson ? ['v3'] : [];
}

/**
 * Fetches Zarr metadata from an OZX archive.
 * Uses OzxFetchStore to read files from within the ZIP archive.
 */
async function fetchOzxZarrMetadata(
  fspName: string,
  ozxFilePath: string,
  files: string[]
): Promise<OzxZarrMetadataResult> {
  const store = new OzxFetchStore(fspName, ozxFilePath);
  const availableVersions = detectOzxZarrVersions(files);

  // Get the base URL for OME-Zarr viewers (using empty internal path)
  const baseUrl = getZipContentUrl(fspName, ozxFilePath, '');

  // Default to Zarr v3 when available
  if (availableVersions.includes('v3')) {
    const zarrJsonContent = await store.get('zarr.json');
    if (!zarrJsonContent) {
      log.warn('Could not read zarr.json from OZX');
      return {
        metadata: null,
        omeZarrUrl: null,
        availableVersions,
        store
      };
    }

    const attrs = JSON.parse(
      new TextDecoder().decode(zarrJsonContent)
    ) as ZarrV3Attrs;

    if (attrs.node_type === 'array') {
      log.info('Getting Zarr array from OZX with Zarr version 3');
      // For OZX arrays, we need a custom store - use baseUrl which routes through OZX API
      const arr = await getZarrArray(baseUrl, 3);
      const shapes = [arr.shape];
      return {
        metadata: {
          arr,
          shapes,
          multiscale: undefined,
          scales: undefined,
          omero: undefined,
          labels: undefined,
          zarrVersion: 3
        },
        omeZarrUrl: null,
        availableVersions,
        store
      };
    } else if (attrs.node_type === 'group') {
      if (attrs.attributes?.ome?.multiscales) {
        log.info('Getting OME-Zarr metadata from OZX with Zarr version 3');
        // Use the OZX content URL as the base for OME-Zarr
        const metadata = await getOmeZarrMetadata(baseUrl);

        // Check for labels
        try {
          const labelsContent = await store.get('labels/zarr.json');
          if (labelsContent) {
            const labelsAttrs = JSON.parse(
              new TextDecoder().decode(labelsContent)
            ) as ZarrV3Attrs;
            metadata.labels = labelsAttrs?.attributes?.ome?.labels;
            if (metadata.labels) {
              log.info('OME-Zarr Labels found in OZX: ', metadata.labels);
            }
          }
        } catch (error) {
          log.trace('Could not fetch labels attrs from OZX: ', error);
        }

        return {
          metadata,
          omeZarrUrl: baseUrl,
          availableVersions,
          store
        };
      } else {
        log.info('OZX Zarrv3 group has no multiscales', attrs.attributes);
        return {
          metadata: null,
          omeZarrUrl: null,
          availableVersions,
          store
        };
      }
    } else {
      log.warn('Unknown OZX Zarrv3 node type', attrs.node_type);
      return {
        metadata: null,
        omeZarrUrl: null,
        availableVersions,
        store
      };
    }
  }

  // RFC-9 OZX is for OME-Zarr v0.5 which requires Zarr v3
  // If we reach here, no valid zarr.json was found
  log.debug('No Zarr v3 data detected in OZX (RFC-9 requires Zarr v3)');
  return {
    metadata: null,
    omeZarrUrl: null,
    availableVersions: [],
    store
  };
}

/**
 * Hook to fetch Zarr metadata from an OZX (Zipped OME-Zarr) file.
 * This hook handles:
 * 1. Listing files within the OZX archive
 * 2. Detecting Zarr version
 * 3. Reading metadata
 * 4. Providing an OzxFetchStore for chunk access
 */
export function useOzxZarrMetadataQuery(
  params: OzxZarrMetadataQueryParams
): UseQueryResult<OzxZarrMetadataResult, Error> {
  const { fspName, ozxFile } = params;

  // First, get the file list from the OZX
  const fileListQuery = useZipFileListQuery(
    fspName,
    ozxFile?.path,
    undefined,
    !!fspName && !!ozxFile && isOzxFile(ozxFile)
  );

  return useQuery({
    queryKey: ['ozx', 'zarr', 'metadata', fspName || '', ozxFile?.path || ''],
    queryFn: async () => {
      if (!fspName || !ozxFile) {
        throw new Error('fspName and ozxFile are required');
      }
      if (!fileListQuery.data) {
        throw new Error('File list not available');
      }
      return await fetchOzxZarrMetadata(
        fspName,
        ozxFile.path,
        fileListQuery.data
      );
    },
    enabled:
      !!fspName &&
      !!ozxFile &&
      isOzxFile(ozxFile) &&
      !!fileListQuery.data &&
      fileListQuery.data.length > 0 &&
      detectOzxZarrVersions(fileListQuery.data).length > 0,
    staleTime: 5 * 60 * 1000,
    retry: false
  });
}

// Re-export OZX detection utilities for convenience
export { isOzxFile } from '@/utils/ozxDetection';
export { OzxFetchStore, getZipContentUrl } from './ozxQueries';
