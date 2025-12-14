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
import { FileOrFolder } from '@/shared.types';

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

/**
 * Detects which Zarr versions are supported by checking for version-specific marker files.
 * @returns Array of supported versions: ['v2'], ['v3'], or ['v2', 'v3']
 */
export function detectZarrVersions(files: FileOrFolder[]): ('v2' | 'v3')[] {
  if (!files || files.length === 0) {
    return [];
  }

  const fileNames = files.map(f => f.name);
  const versions: ('v2' | 'v3')[] = [];

  // Check for Zarr v2 indicators
  if (fileNames.includes('.zarray') || fileNames.includes('.zattrs')) {
    versions.push('v2');
  }

  // Check for Zarr v3 indicator
  if (fileNames.includes('zarr.json')) {
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
    const attrs = (await fetchFileAsJson(fspName, zarrJsonFile.path)) as any;

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
          )) as any;
          metadata.labels = labelsAttrs?.attributes?.ome?.labels as string[];
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
        const attrs = (await fetchFileAsJson(fspName, zattrsFile.path)) as any;
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
            )) as any;
            metadata.labels = labelsAttrs?.labels as string[];
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
