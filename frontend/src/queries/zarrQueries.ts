import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { default as log } from '@/logger';
import {
  getOmeZarrMetadata,
  getOmeZarrThumbnail,
  getZarrArray
} from '@/omezarr-helper';
import type { Metadata } from '@/omezarr-helper';
import { fetchFileAsJson, getFileURL } from '@/utils';
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
};

/**
 * Detects if a directory contains Zarr-related files
 * Returns true if zarr.json, .zarray, or .zattrs files are present
 */
export function isZarrDirectory(files: FileOrFolder[] | undefined): boolean {
  if (!files || files.length === 0) {
    return false;
  }

  const zarrFileNames = ['zarr.json', '.zarray', '.zattrs'];
  return files.some(file => zarrFileNames.includes(file.name));
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
    return { metadata: null, omeZarrUrl: null };
  }

  const imageUrl = getFileURL(fspName, currentFileOrFolder.path);

  // Helper to find file by name
  const getFile = (fileName: string) =>
    files.find((file: FileOrFolder) => file.name === fileName);

  // Check for zarr.json (Zarr v3)
  const zarrJsonFile = getFile('zarr.json');
  if (zarrJsonFile) {
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
          omero: undefined,
          scales: undefined,
          zarrVersion: 3
        },
        omeZarrUrl: null
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
        return {
          metadata,
          omeZarrUrl: imageUrl
        };
      } else {
        log.info('Zarrv3 group has no multiscales', attrs.attributes);
        return { metadata: null, omeZarrUrl: null };
      }
    } else {
      log.warn('Unknown Zarrv3 node type', attrs.node_type);
      return { metadata: null, omeZarrUrl: null };
    }
  }

  // Check for .zarray (Zarr v2 array)
  const zarrayFile = getFile('.zarray');
  if (zarrayFile) {
    log.info('Getting Zarr array for', imageUrl, 'with Zarr version', 2);
    const arr = await getZarrArray(imageUrl, 2);
    const shapes = [arr.shape];
    return {
      metadata: {
        arr,
        shapes,
        multiscale: undefined,
        omero: undefined,
        scales: undefined,
        zarrVersion: 2
      },
      omeZarrUrl: null
    };
  }

  // Check for .zattrs (Zarr v2 OME-Zarr)
  const zattrsFile = getFile('.zattrs');
  if (zattrsFile) {
    const attrs = (await fetchFileAsJson(fspName, zattrsFile.path)) as any;
    if (attrs.multiscales) {
      log.info(
        'Getting OME-Zarr metadata for',
        imageUrl,
        'with Zarr version',
        2
      );
      const metadata = await getOmeZarrMetadata(imageUrl);
      return {
        metadata,
        omeZarrUrl: imageUrl
      };
    }
  }

  // No Zarr metadata found - this is expected for non-Zarr files
  log.debug('No Zarr metadata files found for', imageUrl);
  return { metadata: null, omeZarrUrl: null };
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
      isZarrDirectory(files),
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
