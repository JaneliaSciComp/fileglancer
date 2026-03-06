import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { default as log } from '@/logger';
import {
  getOmeZarrMetadata,
  getOmeZarrThumbnail,
  getZarrArray
} from '@/omezarr-helper';
import type { Metadata } from '@/omezarr-helper';
import { getFileURL } from '@/utils';
import { fetchFileAsJson } from './queryUtils';
import { FileOrFolder } from '@/shared.types';

export type OpenWithToolUrls = {
  copy: string;
} & Record<string, string | null>;

// The 'copy' key is always present, all other keys are viewer-specific
// null means the viewer is incompatible with this dataset
// empty string means the viewer is compatible but no data URL is available yet

export type ZarrMetadata = Metadata | null;

type ZarrMetadataQueryParams = {
  fspName: string | undefined;
  currentFileOrFolder: FileOrFolder | undefined | null;
  files: FileOrFolder[] | undefined;
};

export type ZarrMetadataResult = {
  metadata: ZarrMetadata;
  omeZarrUrl: string | null;
  availableZarrVersions: number[];
  availableOmeZarrVersions: string[];
  isOmeZarr: boolean;
};

// Zarr v3 zarr.json structure
type ZarrV3Attrs = {
  zarr_format?: number;
  node_type: 'array' | 'group';
  attributes?: {
    ome?: {
      version?: string;
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
 * Extracts the OME-NGFF spec version from parsed metadata.
 * Logic follows the OME-NGFF Validator.
 */
export function getOmeNgffVersion(ngffData: Record<string, any>): string {
  let version: string | undefined;

  if (ngffData.attributes?.ome) {
    version = ngffData.attributes.ome.version;
    if (!version) {
      log.warn('No version found in attributes.ome, defaulting to 0.4');
    }
    // Used if 'attributes' is at the root
  } else if (ngffData.ome?.version) {
    version = ngffData.ome.version;
  } else if (ngffData.version) {
    version = ngffData.version;
  } else {
    // 0.4 and earlier: check multiscales, plate, or well
    version =
      ngffData.multiscales?.[0]?.version ??
      ngffData.plate?.version ??
      ngffData.well?.version;
  }

  // for 0.4 and earlier, version wasn't MUST and we defaulted
  // to using v0.4 for validation. To preserve that behaviour
  // return "0.4" if no version found.
  version = version || '0.4';
  // remove any -dev2 etc.
  return version.split('-')[0];
}

export function areZarrMetadataFilesPresent(files: FileOrFolder[]): boolean {
  if (!files || files.length === 0) {
    return false;
  }
  const hasFile = (name: string) => files.some(f => f.name === name);
  return hasFile('zarr.json') || hasFile('.zattrs') || hasFile('.zarray');
}

/**
 * Returns the preferred Zarr storage version from available versions.
 * Prefers v3 if available, otherwise v2.
 */
export function getEffectiveZarrStorageVersion(
  availableZarrVersions: number[]
): 2 | 3 {
  if (availableZarrVersions.includes(3)) {
    return 3;
  }
  return 2;
}

/**
 * Fetches Zarr metadata by checking for zarr.json, .zattrs, and .zarray files.
 * Always checks all metadata sources to build complete version arrays.
 * Start with zarr.json for Zarr v3 metadata, then .zattrs for Zarr v2 metadata, then .zarray as fallback.
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
      availableZarrVersions: [],
      availableOmeZarrVersions: [],
      isOmeZarr: false
    };
  }

  const imageUrl = getFileURL(fspName, currentFileOrFolder.path);

  // Helper to find file by name
  const getFile = (fileName: string) =>
    files.find((file: FileOrFolder) => file.name === fileName);

  const availableZarrVersions: number[] = [];
  const availableOmeZarrVersions: string[] = [];

  // Track whether we found primary metadata from zarr.json
  let primaryMetadata: ZarrMetadataResult | null = null;

  // Step 1: Try zarr.json
  const zarrJsonFile = getFile('zarr.json');
  if (zarrJsonFile) {
    const attrs = (await fetchFileAsJson(
      fspName,
      zarrJsonFile.path
    )) as ZarrV3Attrs;

    // Read zarr_format field for Zarr storage version
    const zarrStorageVersion = attrs.zarr_format;
    if (zarrStorageVersion === undefined || zarrStorageVersion === null) {
      log.warn('zarr.json missing zarr_format field, defaulting to 3');
      availableZarrVersions.push(3);
    } else {
      availableZarrVersions.push(zarrStorageVersion);
    }

    const effectiveVersion: 2 | 3 =
      zarrStorageVersion === 2 || zarrStorageVersion === 3
        ? zarrStorageVersion
        : 3;

    if (attrs.node_type === 'array') {
      log.info(
        'Getting Zarr array for',
        imageUrl,
        'with Zarr version',
        effectiveVersion
      );
      const arr = await getZarrArray(imageUrl, effectiveVersion);
      const shapes = [arr.shape];
      primaryMetadata = {
        metadata: {
          arr,
          shapes,
          multiscale: undefined,
          scales: undefined,
          omero: undefined,
          labels: undefined,
          zarrVersion: effectiveVersion
        },
        omeZarrUrl: null,
        availableZarrVersions,
        availableOmeZarrVersions,
        isOmeZarr: false
      };
    } else if (attrs.node_type === 'group') {
      if (attrs.attributes?.ome?.multiscales) {
        const ngffVersion = getOmeNgffVersion(attrs);
        if (!availableOmeZarrVersions.includes(ngffVersion)) {
          availableOmeZarrVersions.push(ngffVersion);
        }

        log.info(
          'Getting OME-Zarr metadata for',
          imageUrl,
          'with Zarr version',
          effectiveVersion
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
        primaryMetadata = {
          metadata,
          omeZarrUrl: imageUrl,
          availableZarrVersions,
          availableOmeZarrVersions,
          isOmeZarr: true
        };
      } else {
        log.info('Zarrv3 group has no multiscales', attrs.attributes);
        // Don't return yet - continue to check .zattrs
      }
    } else {
      log.warn('Unknown Zarrv3 node type', attrs.node_type);
    }
  }

  // Step 2: Always also check .zattrs
  const zattrsFile = getFile('.zattrs');
  if (zattrsFile) {
    if (!availableZarrVersions.includes(2)) {
      availableZarrVersions.push(2);
    }

    const attrs = (await fetchFileAsJson(
      fspName,
      zattrsFile.path
    )) as ZarrV2Attrs;

    if (attrs.multiscales) {
      const ngffVersion = getOmeNgffVersion(attrs);
      if (!availableOmeZarrVersions.includes(ngffVersion)) {
        availableOmeZarrVersions.push(ngffVersion);
      }

      // If we don't already have primary metadata from zarr.json, use .zattrs
      if (!primaryMetadata) {
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
        primaryMetadata = {
          metadata,
          omeZarrUrl: imageUrl,
          availableZarrVersions,
          availableOmeZarrVersions,
          isOmeZarr: true
        };
      }
    } else {
      log.debug('Zarrv2 .zattrs has no multiscales', attrs);
    }
  }

  // Step 3: If neither zarr.json nor .zattrs had data, check .zarray
  if (!primaryMetadata) {
    const zarrayFile = getFile('.zarray');
    if (zarrayFile) {
      if (!availableZarrVersions.includes(2)) {
        availableZarrVersions.push(2);
      }
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
        availableZarrVersions,
        availableOmeZarrVersions,
        isOmeZarr: false
      };
    }
  }

  // Return primary metadata if found, otherwise return empty result
  if (primaryMetadata) {
    return primaryMetadata;
  }

  log.debug('No Zarr metadata found for', imageUrl);
  return {
    metadata: null,
    omeZarrUrl: null,
    availableZarrVersions,
    availableOmeZarrVersions,
    isOmeZarr: false
  };
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
      areZarrMetadataFilesPresent(files),
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
