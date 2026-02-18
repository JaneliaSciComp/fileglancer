import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { default as log } from '@/logger';
import { getFileURL } from '@/utils';
import { fetchFileAsJson } from './queryUtils';
import type { FileOrFolder } from '@/shared.types';

/**
 * N5 root attributes.json structure
 */
export type N5RootAttributes = {
  n5: string; // e.g., "4.0.0"
  downsamplingFactors?: number[][]; // e.g., [[1,1,1], [2,2,1], ...]
  scales?: number[][]; // Alternative to downsamplingFactors
  resolution?: number[]; // e.g., [157, 157, 628]
  pixelResolution?: {
    unit?: string;
    dimensions: number[];
  }; // Alternative to resolution + units
  units?: string[]; // e.g., ["nm", "nm", "nm"]
  multiScale?: boolean; // e.g., true
};

/**
 * N5 s0/attributes.json structure (scale 0 attributes)
 */
export type N5S0Attributes = {
  dataType: string; // e.g., "uint16"
  compression: {
    type: string; // e.g., "zstd"
    level?: number; // e.g., 3
  };
  blockSize: number[]; // e.g., [128, 128, 128]
  dimensions: number[]; // e.g., [51911, 83910, 3618]
};

/**
 * Combined N5 metadata from both attributes files
 */
export type N5Metadata = {
  rootAttrs: N5RootAttributes;
  s0Attrs: N5S0Attributes;
  dataUrl: string;
};

/**
 * N5 tool URLs - compatible with Zarr's OpenWithToolUrls but with null for unsupported tools
 */
export type N5OpenWithToolUrls = {
  copy: string;
  neuroglancer: string;
};

type N5MetadataQueryParams = {
  fspName: string | undefined;
  currentFileOrFolder: FileOrFolder | undefined | null;
  files: FileOrFolder[] | undefined;
};

/**
 * Detects if the current directory is an N5 dataset.
 * N5 is detected when:
 * 1. attributes.json exists in the current directory
 * 2. A child directory named "s0" exists
 */
export function detectN5(files: FileOrFolder[]): boolean {
  if (!files || files.length === 0) {
    return false;
  }

  const hasAttributesJson = files.some(
    f => f.name === 'attributes.json' && !f.is_dir
  );
  const hasS0Folder = files.some(f => f.name === 's0' && f.is_dir);

  return hasAttributesJson && hasS0Folder;
}

/**
 * Fetches N5 metadata from attributes.json and s0/attributes.json
 */
async function fetchN5Metadata({
  fspName,
  currentFileOrFolder,
  files
}: N5MetadataQueryParams): Promise<N5Metadata | null> {
  if (!fspName || !currentFileOrFolder || !files) {
    log.warn('Missing required parameters for N5 metadata fetch');
    return null;
  }

  const dataUrl = getFileURL(fspName, currentFileOrFolder.path);

  // Find the attributes.json file
  const attributesFile = files.find(
    f => f.name === 'attributes.json' && !f.is_dir
  );
  if (!attributesFile) {
    log.warn('No attributes.json file found');
    return null;
  }

  try {
    // Fetch root attributes.json
    log.info('Fetching N5 root attributes from', attributesFile.path);
    const rootAttrs = (await fetchFileAsJson(
      fspName,
      attributesFile.path
    )) as N5RootAttributes;

    // Construct path to s0/attributes.json
    const s0AttributesPath = currentFileOrFolder.path + '/s0/attributes.json';

    // Fetch s0/attributes.json
    log.info('Fetching N5 s0 attributes from', s0AttributesPath);
    const s0Attrs = (await fetchFileAsJson(
      fspName,
      s0AttributesPath
    )) as N5S0Attributes;

    return {
      rootAttrs,
      s0Attrs,
      dataUrl
    };
  } catch (error) {
    log.error('Error fetching N5 metadata:', error);
    throw error;
  }
}

/**
 * Hook to fetch N5 metadata for the current file/folder
 */
export function useN5MetadataQuery(
  params: N5MetadataQueryParams
): UseQueryResult<N5Metadata | null, Error> {
  const { fspName, currentFileOrFolder, files } = params;

  return useQuery({
    queryKey: [
      'n5',
      'metadata',
      fspName || '',
      currentFileOrFolder?.path || ''
    ],
    queryFn: async () => await fetchN5Metadata(params),
    enabled:
      !!fspName &&
      !!currentFileOrFolder &&
      !!files &&
      files.length > 0 &&
      detectN5(files),
    staleTime: 5 * 60 * 1000, // 5 minutes - N5 metadata doesn't change often
    retry: false
  });
}
